const mongoose = require('mongoose');

const EmailQueueSchema = new mongoose.Schema({
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
    enum: ['Pending', 'Sending', 'Sent', 'Failed', 'Retrying'],
    default: 'Pending',
    index: true
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  errorLog: [{ type: String }],
  scheduledFor: { type: Date, default: Date.now },
  sentAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('EmailQueue', EmailQueueSchema);
