const mongoose = require('mongoose');

const EmailLogSchema = new mongoose.Schema({
  recipient: { type: String, required: true, index: true },
  subject: { type: String, required: true },
  templateCode: { type: String },
  status: { type: String, enum: ['Sent', 'Failed'], required: true },
  sentAt: { type: Date, default: Date.now },
  messageId: { type: String },
  error: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('EmailLog', EmailLogSchema);
