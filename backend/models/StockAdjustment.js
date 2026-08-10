const mongoose = require('mongoose');

const StockAdjustmentSchema = new mongoose.Schema({
  adjNumber: {
    type: String,
    unique: true,
    required: true,
    index: true,
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
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  batchNumber: {
    type: String,
    trim: true,
    default: 'DEFAULT',
  },
  adjustmentType: {
    type: String,
    enum: ['IN', 'OUT'],
    required: [true, 'Adjustment type (IN/OUT) is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0.001, 'Quantity must be greater than zero'],
  },
  reason: {
    type: String,
    required: [true, 'Adjustment reason is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  referenceDoc: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending Approval', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending Approval',
  },
  beforeQty: {
    type: Number,
    default: 0,
  },
  afterQty: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rejectedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

StockAdjustmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

StockAdjustmentSchema.index({ status: 1 });
StockAdjustmentSchema.index({ warehouseId: 1, materialId: 1 });

module.exports = mongoose.model('StockAdjustment', StockAdjustmentSchema);
