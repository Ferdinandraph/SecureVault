const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');
const File = require('../models/File');
const speakeasy = require('speakeasy');
const crypto = require('crypto');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
require('dotenv').config({ path: './.env' });

// Get user stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    console.log('Stats endpoint called with userId:', req.user.id);
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for ID:', req.user.id);
      return res.status(404).json({ message: 'User not found. Please log in again.' });
    }
    const files = await File.find({
      $or: [
        { userId: userId },
        { 'sharedWith.userId': userId },
      ],
    });
    const totalFiles = files.length;
    const storageUsed = files.reduce((sum, file) => sum + file.size, 0);
    const sharedFiles = files.filter((file) => file.sharedWith.length > 0).length;
    const activeShares = files.reduce((sum, file) => sum + file.sharedWith.length, 0);
    const lastWeekFiles = files.filter(
      (f) => new Date(f.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;
    const securityScore =
      (user.isVerified ? 30 : 0) +
      (user.twoFactorEnabled ? 30 : 0) +
      (user.backupCodes && user.backupCodes.length > 0 ? 20 : 0) +
      10;
    res.status(200).json({
      totalFiles,
      lastWeekFiles,
      storageUsed,
      sharedFiles,
      activeShares,
      securityScore,
    });
  } catch (error) {
    console.error('Stats error:', {
      message: error.message,
      stack: error.stack,
      userId: req.user.id,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Get security settings
router.get('/security', authMiddleware, async (req, res) => {
  try {
    console.log('Security endpoint called with userId:', req.user.id);
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for ID:', req.user.id);
      return res.status(404).json({ message: 'User not found. Please log in again.' });
    }
    const securityScore =
      (user.isVerified ? 30 : 0) +
      (user.twoFactorEnabled ? 30 : 0) +
      (user.backupCodes && user.backupCodes.length > 0 ? 20 : 0) +
      10;
    res.status(200).json({
      twoFactorEnabled: user.twoFactorEnabled || false,
      emailVerified: user.isVerified,
      backupCodesGenerated: user.backupCodes && user.backupCodes.length > 0,
      securityScore,
    });
  } catch (error) {
    console.error('Security settings error:', {
      message: error.message,
      stack: error.stack,
      userId: req.user.id,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Toggle 2FA
router.post('/toggle-2fa', authMiddleware, async (req, res) => {
  try {
    const { enable } = req.body;
    if (typeof enable !== 'boolean') return res.status(400).json({ message: 'Enable flag is required.' });
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.isVerified && enable) return res.status(400).json({ message: 'Email must be verified to enable 2FA.' });
    if (enable && !user.twoFactorSecret) {
      user.twoFactorSecret = speakeasy.generateSecret().base32;
    } else if (!enable) {
      user.twoFactorSecret = null;
    }
    user.twoFactorEnabled = enable;
    await user.save();
    res.status(200).json({ message: `2FA ${enable ? 'enabled' : 'disabled'} successfully.` });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Generate backup codes
router.post('/backup-codes', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    user.backupCodes = codes;
    await user.save();
    res.status(200).json({ codes });
  } catch (error) {
    console.error('Backup codes error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Rotate keys
router.post('/rotate-keys', authMiddleware, async (req, res) => {
  try {
    const { publicKey, encryptedPrivateKey } = req.body;
    if (!publicKey || !encryptedPrivateKey)
      return res.status(400).json({ message: 'Public key and encrypted private key are required.' });
    let publicKeyBuffer;
    try {
      publicKeyBuffer = Buffer.from(publicKey, 'base64');
    } catch (e) {
      console.log('Invalid public key encoding', { error: e.message });
      return res.status(400).json({ message: 'Invalid public key encoding.' });
    }
    if (publicKeyBuffer.length < 256 || publicKeyBuffer.length > 300) {
      console.log('Invalid public key size', { length: publicKeyBuffer.length });
      return res.status(400).json({ message: `Invalid public key size: got ${publicKeyBuffer.length} bytes.` });
    }
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.publicKey = publicKey;
    user.encryptedPrivateKey = encryptedPrivateKey;
    user.keyUpdatedAt = new Date();
    await user.save();
    const files = await File.find({ userId: user._id });
    for (const file of files) {
      file.needsKeyUpdate = true;
      await file.save();
    }
    res.status(200).json({ message: 'Keys rotated successfully. Files marked for key update.' });
  } catch (error) {
    console.error('Rotate keys error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Update password
router.post('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    if (newPassword.length < 8)
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.status(200).json({ message: 'Password updated successfully. Please re-encrypt your private key.' });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

module.exports = router;