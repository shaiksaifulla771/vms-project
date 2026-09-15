const mongoose = require('mongoose');

const AuthAuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED',
      'REGISTRATION', 'REGISTRATION_STARTED',
      'LOGIN', 'LOGOUT',
      'EMAIL_VERIFIED',
      'OTP_SENT', 'OTP_VERIFIED', 'OTP_RESENT',
      'ROLE_CHANGED', 'SCOPE_CHANGED',
      'MIGRATION_SUCCESS', 'MIGRATION_FAILED',
      'APPOINTMENT_SCHEDULED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED'
    ]
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetFirebaseUid: {
    type: String
  },
  targetEmail: {
    type: String
  },
  requesterUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  requesterEmail: {
    type: String
  },
  previousAccountStatus: {
    type: String
  },
  newAccountStatus: {
    type: String
  },
  assignedRole: {
    type: String
  },
  assignedSiteIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  }],
  assignedWarehouseIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse'
  }],
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

AuthAuditLogSchema.index({ action: 1, timestamp: -1 });
AuthAuditLogSchema.index({ targetUserId: 1, timestamp: -1 });
AuthAuditLogSchema.index({ requesterUserId: 1, timestamp: -1 });

module.exports = mongoose.model('AuthAuditLog', AuthAuditLogSchema);
