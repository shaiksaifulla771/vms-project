const mongoose = require('mongoose');

const EmailQueueSchema = new mongoose.Schema({
  eventId: { type: String, index: true, sparse: true },
  eventType: { type: String },
  recipient: { type: String, required: true, index: true },
  cc: [{ type: String }],
  bcc: [{ type: String }],
  subject: { type: String, required: true },
  htmlBody: { type: String, required: true },
  textBody: { type: String, default: '' },
  templateCode: { type: String },
  templateData: { type: mongoose.Schema.Types.Mixed },
  status: {
    type: String,
    enum: ['Pending', 'QUEUED', 'Sending', 'PROCESSING', 'Sent', 'SENT', 'Failed', 'FAILED', 'Retrying', 'RETRYING'],
    default: 'QUEUED',
    index: true
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  errorLog: [{ type: String }],
  deliveryStatus: { type: String },
  nextRetryAt: { type: Date },
  lastAttemptAt: { type: Date },
  scheduledFor: { type: Date, default: Date.now },
  sentAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('EmailQueue', EmailQueueSchema);
