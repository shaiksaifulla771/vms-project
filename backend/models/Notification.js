const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  recipientRole: {
    type: String,
    enum: ['Admin', 'admin', 'approver', 'all', null],
    default: 'Admin',
    index: true,
  },
  type: {
    type: String,
    enum: [
      'new_registration',
      'account_approved',
      'account_rejected',
      'role_changed',
      'scope_changed',
      'pending_approval',
      'access_removed',
      'access_transferred',
      'system_alert'
    ],
    required: true,
  },
  title: {
    type: String,
    default: 'System Notification'
  },
  message: {
    type: String,
    required: true,
  },
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'success', 'error'],
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
    index: true
  },
});

NotificationSchema.index({ recipientUserId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipientRole: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);

