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
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET not set in .env');
  process.exit(1);
}

// Email provider configuration
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'nodemailer'; // 'nodemailer' or 'brevo'
console.log(`📧 Using email provider: ${EMAIL_PROVIDER}`);

let transporter;

// Nodemailer setup for local development (Gmail)
if (EMAIL_PROVIDER === 'nodemailer') {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Error: EMAIL_USER and EMAIL_PASS required for nodemailer');
    process.exit(1);
  }

  transporter = nodemailer.createTransporter({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
  });

  transporter.verify((error, success) => {
    if (error) {
      console.error('SMTP configuration failed:', error);
    } else {
      console.log('✅ SMTP server ready (Gmail for local dev)');
    }
  });
}

// Brevo setup validation (no client init needed, create dynamically)
if (EMAIL_PROVIDER === 'brevo') {
  if (!process.env.BREVO_API_KEY) {
    console.error('Error: BREVO_API_KEY required for Brevo');
    process.exit(1);
  }
  if (!process.env.BREVO_SENDER_EMAIL) {
    console.error('Error: BREVO_SENDER_EMAIL required for Brevo');
    process.exit(1);
  }
  console.log('✅ Brevo configuration validated');
}

// Send OTP function - handles nodemailer and brevo
const sendOTP = async (email, otp) => {
  try {
    if (EMAIL_PROVIDER === 'brevo') {
      console.log('📤 Sending OTP via Brevo (sib-api-v3-sdk) to:', email);
      
      // Official Brevo SDK pattern
      const SibApiV3Sdk = require('sib-api-v3-sdk');
      const defaultClient = SibApiV3Sdk.ApiClient.instance;
      
      // Set API key using official method
      const apiKey = defaultClient.authentications['api-key'];
      apiKey.apiKey = process.env.BREVO_API_KEY;
      
      // Create transactional email API instance
      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      
      // Transactional email payload
      const sendSmtpEmail = {
        sender: {
          name: 'SecureVault',
          email: process.env.BREVO_SENDER_EMAIL
        },
        to: [{ email }],
        subject: 'SecureVault Registration OTP',
        htmlContent: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2563eb; text-align: center;">Welcome to SecureVault!</h2>
              <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); 
                          color: white; padding: 40px; text-align: center; 
                          border-radius: 12px; margin: 30px 0; 
                          font-size: 48px; font-weight: bold; letter-spacing: 8px;">
                ${otp}
              </div>
              <p style="text-align: center; color: #666;">
                Your verification code expires in 10 minutes
              </p>
              <p style="text-align: center; color: #999; font-size: 14px;">
                If you didn't request this, please ignore this email.
              </p>
            </body>
          </html>
        `,
        textContent: `Your SecureVault OTP is: ${otp}. It expires in 10 minutes.`
      };

      console.log('🔑 Brevo API key set, sending transactional email...');
      
      const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
      
      if (result.messageId) {
        console.log('✅ Brevo SUCCESS:', result.messageId);
        return true;
      } else {
        console.log('✅ Brevo sent successfully');
        return true;
      }
      
    } else if (EMAIL_PROVIDER === 'nodemailer') {
      // Your existing Gmail code...
      const mailOptions = {
        from: `"SecureVault" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'SecureVault Registration OTP',
        text: `Your OTP: ${otp}`,
        html: `<h1 style="color: #2563eb; text-align: center;">${otp}</h1><p>Expires in 10 minutes</p>`,
        timeout: 30000
      };
      await transporter.sendMail(mailOptions);
      console.log('✅ Gmail OTP sent');
      return true;
    }
  } catch (error) {
    console.error('❌ Brevo Official SDK Error:', {
      message: error.message,
      status: error.status,
      body: error.body,
      response: error.response,
      apiKeyPrefix: process.env.BREVO_API_KEY?.substring(0, 10) + '...'
    });
    throw error;
  }
};

// Register: Send OTP (unchanged)
router.post('/register', async (req, res) => {
  const { email, username, password, publicKey, encryptedPrivateKey } = req.body;
  
  try {
    console.log('🔐 Register attempt:', { email, username, passwordLength: password?.length || 0 });
    
    // Validation
    if (!email || !username || !password || !publicKey || !encryptedPrivateKey) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1:3}\.[0-9]{1:3}\.[0-9]{1:3}\.[0-9]{1:3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    // Validate public key
    let publicKeyBuffer;
    try {
      publicKeyBuffer = Buffer.from(publicKey, 'base64');
    } catch (e) {
      return res.status(400).json({ message: 'Invalid public key encoding.' });
    }
    
    if (publicKeyBuffer.length < 256 || publicKeyBuffer.length > 300) {
      return res.status(400).json({ message: `Invalid public key size: got ${publicKeyBuffer.length} bytes.` });
    }

    // Clean up any existing TempUser first
    await TempUser.deleteOne({ $or: [{ email }, { username }] }).catch(() => {
      console.log('Cleanup of existing TempUser (if any)');
    });

    // Check for existing users
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or username already taken.' });
    }

    // Generate OTP and hash password
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password.trim(), salt);

    // Create TempUser
    const tempUser = new TempUser({
      email,
      username,
      password: hashedPassword,
      publicKey,
      encryptedPrivateKey,
      otp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
    
    await tempUser.save();
    console.log('✅ TempUser saved:', { email, otp });

    // Send OTP
    let otpSent = false;
    try {
      await sendOTP(email, otp);
      otpSent = true;
    } catch (emailError) {
      console.error('Failed to send OTP email:', {
        email,
        provider: EMAIL_PROVIDER,
        error: emailError.message
      });
      
      // Clean up TempUser if email fails
      await TempUser.deleteOne({ email });
      
      return res.status(500).json({ 
        message: 'Failed to send OTP. Please try again.' 
      });
    }

    if (otpSent) {
      res.status(200).json({ message: 'OTP sent to your email.' });
    }
    
  } catch (error) {
    console.error('💥 Register error:', {
      message: error.message,
      stack: error.stack,
      email,
    });
    
    // Clean up any partially created TempUser
    if (email) {
      await TempUser.deleteOne({ email }).catch(cleanupErr => {
        console.error('Cleanup error:', cleanupErr);
      });
    }
    
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// Verify OTP (unchanged)
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    console.log('🔍 Verify OTP attempt:', { email, otp });
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });
    
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) return res.status(400).json({ message: 'No registration found. Please register again.' });
    
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
    console.log('✅ User created:', { email, userId: user._id });
    await TempUser.deleteOne({ email });

    const token = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('🔑 Token generated for:', email);
    
    res.status(200).json({
      token,
      user: { id: user._id, email: user.email, username: user.username, encryptedPrivateKey: user.encryptedPrivateKey },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Login (unchanged)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('🔐 Login request:', { email, passwordLength: password?.length || 0 });
  try {
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.status(400).json({ message: 'Invalid credentials or account not verified.' });

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect password.' });

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

// Get public key (unchanged)
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

// Validate email (unchanged)
router.post('/validate-email', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: `Email ${email} not registered.` });
    }
    res.status(200).json({ message: 'Email is registered.' });
  } catch (error) {
    console.error('Email validation error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

module.exports = router;