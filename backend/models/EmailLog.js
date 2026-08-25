const mongoose = require('mongoose');

const EmailLogSchema = new mongoose.Schema({
  eventId: { type: String, index: true, sparse: true },
  eventType: { type: String, index: true },
  recipient: { type: String, required: true, index: true },
  subject: { type: String, required: true },
  templateCode: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  status: {
    type: String,
    enum: ['QUEUED', 'PROCESSING', 'Sent', 'DELIVERED', 'Failed', 'RETRYING', 'BOUNCED'],
    required: true
  },
  sentAt: { type: Date, default: Date.now },
  deliveredAt: { type: Date },
  messageId: { type: String },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  error: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('EmailLog', EmailLogSchema);
