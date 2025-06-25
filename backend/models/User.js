const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  backupCodes: [{ type: String }],
  publicKey: { type: String, required: true },
  encryptedPrivateKey: { type: String, required: true },
  keyUpdatedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function (next) {
  // Check if password is modified and not already hashed
  if (this.isModified('password') && !this.password.startsWith('$2b$')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);