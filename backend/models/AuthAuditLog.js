const mongoose = require('mongoose');

const AuthAuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'REGISTRATION', 'LOGIN', 'LOGOUT', 'EMAIL_VERIFIED', 'MIGRATION_SUCCESS', 'MIGRATION_FAILED']
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
