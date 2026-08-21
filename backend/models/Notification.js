const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientRole: {
    type: String,
    enum: ['admin', 'approver'],
    default: 'admin',
    index: true,
  },
  type: {
    type: String,
    enum: ['access_removed', 'access_transferred', 'pending_approval', 'new_registration'],
    required: true,
  },
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  message: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    enum: ['info', 'warning'],
    default: 'info',
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

NotificationSchema.index({ recipientRole: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
