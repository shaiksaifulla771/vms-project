const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  entityType: {
    type: String,
    required: true,
    enum: ['Vendor', 'Material', 'BOM', 'InventoryItem', 'PurchaseOrder', 'PurchaseRequest', 'ProductionOrder', 'ProductionPlan', 'MRPRun', 'QualityRecord', 'User', 'ApprovalRequest', 'Contract', 'MPN', 'Warehouse', 'Site', 'VendorMaster', 'ImportJob', 'System', 'Visitor', 'Appointment', 'EmailTemplate', 'EmailQueue', 'Workflow', 'WorkflowExecution', 'Plugin', 'MCPTool', 'UserAccessAssignment']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'APPROVE', 'REJECT', 'VIEW', 'EXPORT', 'LOGIN', 'LOGOUT', 'BULK_IMPORT', 'EXECUTE', 'SEND', 'QUEUE', 'RETRY', 'ENABLE', 'DISABLE', 'CHECK_IN', 'CHECK_OUT', 'DEACTIVATE', 'REACTIVATE', 'TRANSFER_SITE', 'ACCESS_CHANGE', 'ROLE_CHANGE', 'ASSIGN_SCOPE', 'DEACTIVATE_SCOPE', 'TRANSFER_SCOPE', 'UNLINK_SCOPE', 'APPROVE_REGISTRATION', 'REJECT_REGISTRATION', 'DEACTIVATE_LOCATION', 'BULK_DEACTIVATE']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: String,
  role: String,
  module: { type: String, default: 'General' },
  result: { type: String, enum: ['Success', 'Failure'], default: 'Success' },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  locationName: String,
  reason: String,
  previousValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  changes: {
    type: mongoose.Schema.Types.Mixed, // Stores the true before/after diff payload
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  correlationId: { type: String, index: true },
  ipAddress: String,
  userAgent: String,
  hashChain: { type: String },
  previousHash: { type: String, default: 'GENESIS' },
  retentionCategory: { type: String, enum: ['Financial', 'Operational', 'Access', 'System'], default: 'Operational' },
  legalHold: { type: Boolean, default: false }
});

// Indexing for efficient querying by entity and time
AuditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });

const blockMutation = function(next) { next(new Error('AuditLog is append-only: updates and deletes are forbidden')); };
AuditLogSchema.pre('updateOne', blockMutation);
AuditLogSchema.pre('updateMany', blockMutation);
AuditLogSchema.pre('deleteOne', blockMutation);
AuditLogSchema.pre('deleteMany', blockMutation);
AuditLogSchema.pre('findOneAndUpdate', blockMutation);
AuditLogSchema.pre('findOneAndDelete', blockMutation);
AuditLogSchema.pre('findOneAndReplace', blockMutation);

module.exports = mongoose.model('AuditLog', AuditLogSchema);
