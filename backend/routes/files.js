const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const { GridFSBucket } = require('mongodb');
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

// Multer setup for memory storage (files go to MongoDB)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Initialize GridFS
let gfs;
mongoose.connection.once('open', () => {
  gfs = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  console.log('GridFS initialized');
});

// Debug endpoint to list uploaded files in GridFS
router.get('/debug/uploads', async (req, res) => {
  try {
    const files = await mongoose.connection.db.collection('uploads.files').find().toArray();
    console.log('Debug uploads:', { fileCount: files.length, files: files.map(f => f.filename) });
    res.status(200).json({ files });
  } catch (error) {
    console.error('Debug uploads error:', { message: error.message, stack: error.stack });
    res.status(500).json({ message: 'Cannot read uploads.', error: error.message });
  }
});

// Upload file
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { encryptionKey, encryptedKey, iv, fileType } = req.body;
    console.log('Upload attempt:', {
      userId: req.user.id,
      filename: req.file?.originalname,
      size: req.file?.size,
      encryptionKeyLength: encryptionKey?.length,
      encryptedKeyLength: encryptedKey?.length,
      iv: !!iv,
      fileType,
    });

    if (!req.file || !encryptionKey || !encryptedKey || !iv || !fileType) {
      console.log('Missing fields:', {
        file: !!req.file,
        encryptionKey: !!encryptionKey,
        encryptedKey: !!encryptedKey,
        iv: !!iv,
        fileType: !!fileType,
      });
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      console.log('Invalid user ID:', { userId: req.user.id });
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    let aesKeyBuffer;
    try {
      aesKeyBuffer = Buffer.from(encryptionKey, 'base64');
    } catch (e) {
      console.log('Invalid base64 encoding for encryptionKey:', { error: e.message });
      return res.status(400).json({ message: 'Invalid encryption key encoding.' });
    }
    if (aesKeyBuffer.length !== 32) {
      console.log('Invalid AES key size:', { length: aesKeyBuffer.length });
      return res.status(400).json({ message: `Invalid AES key size: expected 32 bytes, got ${aesKeyBuffer.length}.` });
    }

    try {
      Buffer.from(encryptedKey, 'base64');
    } catch (e) {
      console.log('Invalid base64 encoding for encryptedKey:', { error: e.message });
      return res.status(400).json({ message: 'Invalid encrypted key encoding.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('User not found:', { userId: req.user.id });
      return res.status(404).json({ message: 'User not found.' });
    }

    // Store file in GridFS
    const uploadStream = gfs.openUploadStream(req.file.originalname, {
      metadata: { userId: req.user.id, timestamp: Date.now() },
    });
    uploadStream.end(req.file.buffer);
    const gridfsFileId = await new Promise((resolve, reject) => {
      uploadStream.on('finish', () => resolve(uploadStream.id));
      uploadStream.on('error', reject);
    });

    const file = new File({
      filename: req.file.originalname,
      gridfsFileId: gridfsFileId,
      size: req.file.size,
      userId: new mongoose.Types.ObjectId(req.user.id),
      encryptionKey,
      encryptedKey,
      iv,
      fileType,
      sharedWith: [],
    });

    try {
      const savedFile = await file.save();
      console.log('File saved to MongoDB:', {
        fileId: savedFile._id,
        gridfsFileId,
        filename: savedFile.filename,
        userId: savedFile.userId,
        size: savedFile.size,
      });
      res.status(200).json({ message: 'File uploaded successfully.', fileId: savedFile._id });
    } catch (saveError) {
      console.error('File save error:', {
        message: saveError.message,
        stack: saveError.stack,
        code: saveError.code,
        fileData: {
          filename: req.file.originalname,
          userId: req.user.id,
          gridfsFileId,
        },
      });
      // Clean up GridFS file if metadata save fails
      await gfs.delete(gridfsFileId).catch((deleteError) => {
        console.error('GridFS cleanup error:', {
          message: deleteError.message,
          stack: deleteError.stack,
          gridfsFileId,
        });
      });
      return res.status(500).json({ message: 'Failed to save file metadata.', error: saveError.message });
    }
  } catch (error) {
    console.error('Upload error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      userId: req.user?.id,
      filename: req.file?.originalname,
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
    });
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
    if (!file) {
      console.log('File not found:', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    if (
      file.userId.toString() !== req.user.id &&
      !file.sharedWith.some((share) => share.userId?.toString() === req.user.id)
    ) {
      console.log('Unauthorized access:', { fileId: req.params.fileId, userId: req.user.id });
      return res.status(403).json({ message: 'Unauthorized access.' });
    }
    if (!file.gridfsFileId) {
      console.log('Missing gridfsFileId:', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'File storage ID missing.' });
    }
    const downloadStream = gfs.openDownloadStream(file.gridfsFileId);
    let fileData = [];
    downloadStream.on('data', (chunk) => fileData.push(chunk));
    downloadStream.on('error', (error) => {
      console.error('Download stream error:', { fileId: req.params.fileId, error: error.message });
      res.status(404).json({ message: 'File not found in storage.' });
    });
    downloadStream.on('end', () => {
      const buffer = Buffer.concat(fileData);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(buffer);
    });
  } catch (error) {
    console.error('Download error:', {
      message: error.message,
      stack: error.stack,
      fileId: req.params.fileId,
    });
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
    console.error('Validate error:', {
      message: error.message,
      stack: error.stack,
    });
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
    if (!file) {
      console.log('File not found:', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    if (file.userId.toString() !== req.user.id) {
      console.log('Unauthorized access:', { fileId: req.params.fileId, userId: req.user.id });
      return res.status(403).json({ message: 'Unauthorized access.' });
    }
    if (!file.gridfsFileId) {
      console.log('Missing gridfsFileId, removing metadata only:', { fileId: req.params.fileId });
    } else {
      await gfs.delete(file.gridfsFileId);
      console.log('File removed from GridFS:', { fileId: req.params.fileId, gridfsFileId: file.gridfsFileId });
    }
    await File.deleteOne({ _id: req.params.fileId });
    console.log('File metadata deleted:', { fileId: req.params.fileId });
    res.status(200).json({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Delete error:', {
      message: error.message,
      stack: error.stack,
      fileId: req.params.fileId,
    });
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
    const normalizeOrigin = (origin) => origin?.replace(/\/$/, '');
    const shareLink = recipient
      ? `${normalizeOrigin(process.env.CLIENT_URI)}/share/${file._id}/${shareToken}`
      : `${normalizeOrigin(process.env.CLIENT_URI)}/public/share/${file._id}/${shareToken}`;

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
      fileId: req.params.fileId,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Access shared file (authenticated users)
router.get('/share/:fileId/:token', authMiddleware, async (req, res) => {
  try {
    console.log('Authenticated share access attempt:', {
      fileId: req.params.fileId,
      token: req.params.token,
      userId: req.user.id,
    });
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      console.log('Invalid file ID:', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file || file.shareToken !== req.params.token) {
      console.log('Invalid share link:', { fileId: req.params.fileId, token: req.params.token });
      return res.status(404).json({ message: 'Invalid share link.' });
    }
    if (!file.sharedWith.some((share) => share.userId?.toString() === req.user.id)) {
      console.log('Unauthorized access:', { fileId: req.params.fileId, userId: req.user.id });
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
    console.error('Share access error:', {
      message: error.message,
      stack: error.stack,
      fileId: req.params.fileId,
      token: req.params.token,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Access shared file (public)
router.get('/public/share/:fileId/:token', async (req, res) => {
  try {
    console.log('Public share access attempt:', {
      fileId: req.params.fileId,
      token: req.params.token,
      origin: req.get('Origin'),
    });
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      console.log('Invalid file ID:', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) {
      console.log('File not found:', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    const shareEntry = file.sharedWith.find((share) => share.publicToken === req.params.token);
    if (!shareEntry) {
      console.log('Invalid share token:', { fileId: req.params.fileId, token: req.params.token });
      return res.status(404).json({ message: 'Invalid share link.' });
    }
    res.status(200).json({
      _id: file._id,
      filename: file.filename,
      size: file.size,
      iv: file.iv,
      sharedWith: [shareEntry],
    });
  } catch (error) {
    console.error('Public share access error:', {
      message: error.message,
      stack: error.stack,
      fileId: req.params.fileId,
      token: req.params.token,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Download file (public)
router.get('/public/download/:fileId/:token', async (req, res) => {
  try {
    console.log('Public download attempt:', {
      fileId: req.params.fileId,
      token: req.params.token,
      origin: req.get('Origin'),
    });
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      console.log('Invalid file ID:', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) {
      console.log('File not found:', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    const shareEntry = file.sharedWith.find((share) => share.publicToken === req.params.token);
    if (!shareEntry) {
      console.log('Invalid share token:', { fileId: req.params.fileId, token: req.params.token });
      return res.status(404).json({ message: 'Invalid share link.' });
    }
    if (!file.gridfsFileId) {
      console.log('Missing gridfsFileId:', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'File storage ID missing.' });
    }
    const downloadStream = gfs.openDownloadStream(file.gridfsFileId);
    let fileData = [];
    downloadStream.on('data', (chunk) => fileData.push(chunk));
    downloadStream.on('error', (error) => {
      console.error('Download stream error:', { fileId: req.params.fileId, error: error.message });
      res.status(404).json({ message: 'File not found in storage.' });
    });
    downloadStream.on('end', () => {
      const buffer = Buffer.concat(fileData);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(buffer);
    });
  } catch (error) {
    console.error('Public download error:', {
      message: error.message,
      stack: error.stack,
      fileId: req.params.fileId,
      token: req.params.token,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Revoke access
router.delete('/revoke/:fileId/:recipientId', authMiddleware, async (req, res) => {
  try {
    const recipientId = req.params.recipientId;
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      console.log('Invalid file ID:', { fileId: req.params.fileId });
      return res.status(400).json({ message: 'Invalid file ID.' });
    }
    const file = await File.findById(req.params.fileId);
    if (!file) {
      console.log('File not found:', { fileId: req.params.fileId });
      return res.status(404).json({ message: 'File not found.' });
    }
    if (file.userId.toString() !== req.user.id) {
      console.log('Unauthorized access:', { fileId: req.params.fileId, userId: req.user.id });
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
    console.error('Revoke error:', {
      message: error.message,
      stack: error.stack,
      fileId: req.params.fileId,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

module.exports = router;