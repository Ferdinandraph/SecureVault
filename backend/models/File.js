const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  email: { type: String, default: null },
  encryptedKey: { type: String, required: true },
  salt: { type: String, required: true },
  iv: { type: String, required: true },
  publicToken: { type: String, default: null },
});

const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  gridfsFileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Replaced path
  size: { type: Number, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  encryptionKey: { type: String, required: true },
  encryptedKey: { type: String, required: true },
  iv: { type: String, required: true },
  fileType: { type: String, required: true },
  sharedWith: [shareSchema],
  shareLink: { type: String, index: { unique: true, sparse: true } },
  shareToken: { type: String },
  createdAt: { type: Date, default: Date.now },
  needsKeyUpdate: { type: Boolean, default: false },
});

module.exports = mongoose.model('File', fileSchema);