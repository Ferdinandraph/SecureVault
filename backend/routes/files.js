const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const File = require('../models/File');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
require('dotenv').config({ path: './.env' });

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './Uploads'),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Upload file
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { encryptionKey, encryptedKey, iv, fileType } = req.body;
    console.log('Upload attempt:', {
      userId: req.user.id,
      filename: req.file?.originalname,
      encryptionKeyLength: encryptionKey?.length,
      encryptedKeyLength: encryptedKey?.length,
      iv: !!iv,
      fileType,
    });

    if (!req.file || !encryptionKey || !encryptedKey || !iv || !fileType) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    let aesKeyBuffer;
    try {
      aesKeyBuffer = Buffer.from(encryptionKey, 'base64');
    } catch (e) {
      console.log('Invalid base64 encoding for encryptionKey', { error: e.message });
      return res.status(400).json({ message: 'Invalid encryption key encoding.' });
    }
    if (aesKeyBuffer.length !== 32) {
      console.log('Invalid AES key size', { length: aesKeyBuffer.length });
      return res.status(400).json({ message: `Invalid AES key size: expected 32 bytes, got ${aesKeyBuffer.length}.` });
    }

    try {
      Buffer.from(encryptedKey, 'base64');
    } catch (e) {
      console.log('Invalid base64 encoding for encryptedKey', { error: e.message });
      return res.status(400).json({ message: 'Invalid encrypted key encoding.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const file = new File({
      filename: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      userId: new mongoose.Types.ObjectId(req.user.id),
      encryptionKey,
      encryptedKey,
      iv,
      fileType,
      sharedWith: [],
    });

    await file.save();
    console.log('File saved:', { fileId: file._id });
    res.status(200).json({ message: 'File uploaded successfully.', fileId: file._id });
  } catch (error) {
    console.error('Upload error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate share link error. Please try again.' });
    }
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// List files
router.get('/list', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }
    const files = await File.find({
      $or: [
        { userId: new mongoose.Types.ObjectId(req.user.id) },
        { 'sharedWith.userId': new mongoose.Types.ObjectId(req.user.id) },
      ],
    }).select('-path');
    console.log('Files listed for user:', { userId: req.user.id, fileCount: files.length });
    res.status(200).json(files);
  } catch (error) {
    console.error('List files error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Download file (authenticated users)
router.get('/download/:fileId', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ message: 'File not found.' });
    if (
      file.userId.toString() !== req.user.id &&
      !file.sharedWith.some((share) => share.userId?.toString() === req.user.id)
    ) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }
    const safePath = path.resolve(file.path);
    const uploadDirPath = path.resolve(process.env.UPLOAD_DIR || './Uploads');
    if (!safePath.startsWith(uploadDirPath)) {
      return res.status(403).json({ message: 'Invalid file path.' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.sendFile(safePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Validate file
router.get('/validate/:fileId', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) {
      console.log('Validation failed: File not found', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    if (file.userId.toString() !== req.user.id) {
      console.log('Validation failed: Unauthorized', { fileId: req.params.fileId, userId: req.user.id });
      return res.status(403).json({ message: 'Unauthorized access.' });
    }
    console.log('Validation succeeded', { fileId: req.params.fileId });
    res.status(200).json({ message: 'File exists.' });
  } catch (error) {
    console.error('Validate error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Delete file
router.delete('/delete/:fileId', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ message: 'File not found.' });
    if (file.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }
    await File.deleteOne({ _id: req.params.fileId });
    console.log('File deleted:', { fileId: req.params.fileId });
    res.status(200).json({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Share file
router.post('/share-link/:fileId', authMiddleware, async (req, res) => {
  try {
    const { recipientEmail, decryptionKey } = req.body;
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      console.log('Share failed: Invalid file ID', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) {
      console.log('Share failed: File not found', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    if (file.userId.toString() !== req.user.id) {
      console.log('Share failed: Unauthorized', { fileId: req.params.fileId, userId: req.user.id });
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    let recipient = null;
    if (recipientEmail) {
      recipient = await User.findOne({ email: recipientEmail });
      if (!recipient) {
        console.log('Recipient not found, proceeding as public share', { recipientEmail });
      }
    }

    let aesKeyBuffer;
    try {
      aesKeyBuffer = Buffer.from(file.encryptionKey, 'base64');
    } catch (e) {
      console.log('Invalid base64 encoding for encryptionKey', { fileId: file._id, error: e.message });
      return res.status(400).json({ message: 'Invalid encryption key encoding in file.' });
    }
    if (aesKeyBuffer.length !== 32) {
      console.log('Invalid AES key size', { fileId: file._id, length: aesKeyBuffer.length });
      return res.status(400).json({ message: `Invalid AES key size: expected 32 bytes, got ${aesKeyBuffer.length}.` });
    }

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const passwordKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      await crypto.subtle.importKey('raw', Buffer.from(decryptionKey), 'PBKDF2', false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    let encryptedKey;
    try {
      encryptedKey = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        passwordKey,
        aesKeyBuffer
      );
    } catch (e) {
      console.error('Encryption failed:', { error: e.message, cause: e.cause?.message });
      return res.status(400).json({ message: `Encryption failed: ${e.message}` });
    }

    const shareToken = crypto.randomBytes(32).toString('hex');
    const shareLink = recipient
      ? `${process.env.CLIENT_URI}/share/${file._id}/${shareToken}`
      : `${process.env.CLIENT_URI}/public/share/${file._id}/${shareToken}`;

    const shareEntry = {
      userId: recipient ? recipient._id : null,
      email: recipientEmail || null,
      encryptedKey: Buffer.from(encryptedKey).toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      publicToken: recipient ? null : shareToken,
    };

    file.sharedWith.push(shareEntry);
    file.shareLink = shareLink;
    file.shareToken = shareToken;
    await file.save();

    if (recipientEmail) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: `Shared File: ${file.filename}`,
        text: `You have received a shared file: ${file.filename}\n\nAccess it here: ${shareLink}\n\nTo decrypt the file, use the decryption key provided by the sender separately.`,
      });
    }

    console.log('File shared:', { fileId: file._id, shareLink, recipientEmail });
    res.status(200).json({ shareLink });
  } catch (error) {
    console.error('Share error:', {
      message: error.message,
      cause: error.cause?.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Access shared file (authenticated users)
router.get('/share/:fileId/:token', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file || file.shareToken !== req.params.token) {
      return res.status(404).json({ message: 'Invalid share link.' });
    }
    if (!file.sharedWith.some((share) => share.userId?.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }
    res.status(200).json({
      _id: file._id,
      filename: file.filename,
      size: file.size,
      iv: file.iv,
      sharedWith: file.sharedWith,
    });
  } catch (error) {
    console.error('Share access error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Access shared file (public)
router.get('/public/share/:fileId/:token', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file || !file.sharedWith.some((share) => share.publicToken === req.params.token)) {
      return res.status(404).json({ message: 'Invalid share link.' });
    }
    res.status(200).json({
      _id: file._id,
      filename: file.filename,
      size: file.size,
      iv: file.iv,
      sharedWith: file.sharedWith.filter((share) => share.publicToken === req.params.token),
    });
  } catch (error) {
    console.error('Public share access error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Download file (public)
router.get('/public/download/:fileId/:token', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file || !file.sharedWith.some((share) => share.publicToken === req.params.token)) {
      return res.status(404).json({ message: 'Invalid share link.' });
    }
    const safePath = path.resolve(file.path);
    const uploadDirPath = path.resolve(process.env.UPLOAD_DIR || './Uploads');
    if (!safePath.startsWith(uploadDirPath)) {
      return res.status(403).json({ message: 'Invalid file path.' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.sendFile(safePath);
  } catch (error) {
    console.error('Public download error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Revoke access
router.delete('/revoke/:fileId/:recipientId', authMiddleware, async (req, res) => {
  try {
    const recipientId = req.params.recipientId;
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ message: 'File not found.' });
    if (file.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    file.sharedWith = file.sharedWith.filter(
      (share) =>
        !(
          (share.userId && share.userId.toString() === recipientId) ||
          (share.publicToken && share.publicToken === recipientId)
        )
    );
    if (file.sharedWith.length === 0) {
      file.shareLink = null;
      file.shareToken = null;
    }
    await file.save();
    console.log('Access revoked:', { fileId: file._id });
    res.status(200).json({ message: 'Access revoked successfully.' });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

module.exports = router;