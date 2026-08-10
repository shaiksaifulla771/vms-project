const mongoose = require('mongoose');

const EmailTemplateSchema = new mongoose.Schema({
  templateCode: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  subject: { type: String, required: true },
  htmlBody: { type: String, required: true },
  textBody: { type: String, default: '' },
  variables: [{ type: String }],
  category: {
    type: String,
    enum: ['Visitor', 'Appointment', 'Workflow', 'System', 'Notification'],
    default: 'Visitor'
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);
