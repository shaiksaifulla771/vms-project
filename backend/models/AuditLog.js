const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  entityType: {
    type: String,
    required: true,
    enum: ['Vendor', 'Material', 'BOM', 'InventoryItem', 'PurchaseOrder', 'ProductionOrder', 'ImportJob']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed, // Stores the true before/after diff payload
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Indexing for efficient querying by entity and time
AuditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
