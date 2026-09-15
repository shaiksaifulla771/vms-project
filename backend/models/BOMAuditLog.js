const mongoose = require('mongoose');

const BOMAuditLogSchema = new mongoose.Schema({
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'DUPLICATE', 'VERSION_BUMP'],
    required: true
  },
  performedBy: {
    type: String,
    default: 'System'
  },
  ipAddress: {
    type: String,
    default: 'Unknown'
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

// Optimize querying
BOMAuditLogSchema.index({ bomId: 1, createdAt: -1 });

module.exports = mongoose.model('BOMAuditLog', BOMAuditLogSchema);
