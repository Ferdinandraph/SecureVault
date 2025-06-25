const mongoose = require('mongoose');

const tempUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
  publicKey: { type: String, required: true },
  encryptedPrivateKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '24h' },
});

module.exports = mongoose.model('TempUser', tempUserSchema);