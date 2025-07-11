const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
require('dotenv').config({ path: './.env' });

// Validate environment variables
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.JWT_SECRET) {
  console.error('Error: EMAIL_USER, EMAIL_PASS, or JWT_SECRET not set in .env');
  process.exit(1);
}

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP configuration error:', error);
  } else {
    console.log('SMTP server ready');
  }
});

// Register: Send OTP
router.post('/register', async (req, res) => {
  const { email, username, password, publicKey, encryptedPrivateKey } = req.body;
  try {
    console.log('Register attempt:', { email, username, passwordLength: password.length });
    if (!email || !username || !password || !publicKey || !encryptedPrivateKey) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    let publicKeyBuffer;
    try {
      publicKeyBuffer = Buffer.from(publicKey, 'base64');
    } catch (e) {
      console.log('Invalid public key encoding', { email, error: e.message });
      return res.status(400).json({ message: 'Invalid public key encoding.' });
    }
    if (publicKeyBuffer.length < 256 || publicKeyBuffer.length > 300) {
      console.log('Invalid public key size', { email, length: publicKeyBuffer.length });
      return res.status(400).json({ message: `Invalid public key size: got ${publicKeyBuffer.length} bytes.` });
    }
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    const existingTempUser = await TempUser.findOne({ $or: [{ email }, { username }] });
    if (existingUser || existingTempUser) {
      return res.status(400).json({ message: 'Email or username already taken.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password.trim(), salt);
    console.log('Hashed password for TempUser:', { email, hashedPassword });

    const tempUser = new TempUser({
      email,
      username,
      password: hashedPassword,
      publicKey,
      encryptedPrivateKey,
      otp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
    });
    await tempUser.save();
    console.log('TempUser saved:', { email, otp });

    console.log('Sending OTP email to:', email, 'OTP:', otp);
    await transporter.sendMail({
      from: `"SecureVault" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'SecureVault Registration OTP',
      text: `Your OTP for SecureVault registration is: ${otp}. It expires in 10 minutes.`,
    });

    res.status(200).json({ message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('Register error:', {
      message: error.message,
      stack: error.stack,
      email,
    });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    console.log('Verify OTP attempt:', { email, otp });
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) return res.status(400).json({ message: 'User not found.' });
    if (tempUser.otp !== otp || tempUser.otpExpires < Date.now()) {
      await TempUser.deleteOne({ email });
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    // Check for existing user to prevent duplicates
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await TempUser.deleteOne({ email });
      return res.status(400).json({ message: 'User already exists.' });
    }

    const user = new User({
      email: tempUser.email,
      username: tempUser.username,
      password: tempUser.password,
      publicKey: tempUser.publicKey,
      encryptedPrivateKey: tempUser.encryptedPrivateKey,
      isVerified: true,
    });
    await user.save();
    console.log('User created:', { email, userId: user._id, hashedPassword: user.password });
    await TempUser.deleteOne({ email });

    const token = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Token generated for:', { email, userId: user._id });
    res.status(200).json({
      token,
      user: { id: user._id, email: user.email, username: user.username, encryptedPrivateKey: user.encryptedPrivateKey },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request:', { email, passwordLength: password.length });
  try {
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.status(400).json({ message: 'Invalid credentials or account not verified.' });

    console.log('Comparing password for:', email, 'Stored hash:', user.password);
    const isMatch = await bcrypt.compare(password.trim(), user.password);
    console.log('Password match result:', isMatch);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect password.' });

    console.log('Generating JWT for:', email);
    const token = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({
      token,
      user: { id: user._id, email: user.email, username: user.username, encryptedPrivateKey: user.encryptedPrivateKey },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Get public key
router.get('/public-key/:email', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.status(200).json({ publicKey: user.publicKey, encryptedPrivateKey: user.encryptedPrivateKey });
  } catch (error) {
    console.error('Public key error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Validate email
router.post('/validate-email', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Email validation failed:', { email });
      return res.status(404).json({ message: `Email ${email} not registered.` });
    }
    console.log('Email validation succeeded:', { email });
    res.status(200).json({ message: 'Email is registered.' });
  } catch (error) {
    console.error('Email validation error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

module.exports = router;