const mongoose = require('mongoose');

const InventoryTransactionSchema = new mongoose.Schema({
  txnId: {
    type: String,
    index: true,
  },
  idempotencyKey: {
    type: String,
    index: true,
    unique: true,
    sparse: true,
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse reference is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Transaction quantity is required'],
  },
  delta: {
    type: Number,
  },
  beforeQty: {
    type: Number,
    default: 0,
  },
  afterQty: {
    type: Number,
    default: 0,
  },
  type: {
    type: String,
    enum: [
      'Opening',
      'GRN',
      'purchase',
      'Reservation',
      'Release',
      'Issue',
      'consumption',
      'production',
      'adjustment',
      'Production Consumption',
      'Production Receipt',
      'Transfer Out',
      'Transfer In',
      'Transfer',
      'QC Hold',
      'QC Release',
      'Scrap',
      'Return',
      // Standardized ERP types
      'RECEIPT',
      'ISSUE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'RESERVATION',
      'RELEASE',
      'TRANSFER_OUT',
      'TRANSFER_IN',
      'PRODUCTION_CONSUMPTION',
      'PRODUCTION_OUTPUT',
      'RETURN',
      'REVERSAL'
    ],
    required: [true, 'Transaction type is required'],
  },
  batchNumber: {
    type: String,
    trim: true,
    default: 'DEFAULT',
  },
  lotNumber: {
    type: String,
    trim: true,
  },
  referenceId: {
    type: String,
  },
  sourceDocType: {
    type: String, // e.g. 'ProductionPlan', 'ProductionOrder', 'PO', 'QCInspection', 'StockAdjustment', 'StockTransfer'
  },
  sourceDocId: {
    type: String,
  },
  reason: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  auditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  auditStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Audited', 'Rejected'],
    default: 'Approved',
  },
  notes: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

InventoryTransactionSchema.index({ materialId: 1, warehouseId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ siteId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ type: 1, createdAt: -1 });
InventoryTransactionSchema.index({ createdAt: -1 });
InventoryTransactionSchema.index({ sourceDocId: 1 });

module.exports = mongoose.model('InventoryTransaction', InventoryTransactionSchema);
