const mongoose = require('mongoose');

const ProductionPlanSchema = new mongoose.Schema({
  planNumber: {
    type: String,
    unique: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Product (Material) reference is required'],
  },
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: [true, 'BOM reference is required'],
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse/Site context is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0.001, 'Quantity must be greater than zero'],
  },
  originalQuantity: {
    type: Number,
    min: 0,
  },
  scheduledQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  remainingQuantity: {
    type: Number,
    min: 0,
  },
  copiedFromPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionPlan',
  },
  requiredDate: {
    type: Date,
    required: [true, 'Required date is required'],
  },
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Unscheduled', 'Partially Scheduled', 'Scheduled', 'Released', 'Material Reserved', 'Allocated', 'In Production', 'Completed', 'Cancelled'],
    default: 'Unscheduled',
  },
  planSource: {
    type: String,
    enum: ['MRP', 'Manual'],
    default: 'Manual',
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium',
  },
  scheduledStartDate: {
    type: Date,
  },
  scheduledEndDate: {
    type: Date,
  },
  workCenter: {
    type: String,
    trim: true,
    default: 'Main Assembly Line 1',
  },
  reason: {
    type: String,
    default: '',
  },
  cancelReason: {
    type: String,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  cancelledAt: {
    type: Date,
  },
  notes: {
    type: String,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

// Update timestamp & quantity balances on save
ProductionPlanSchema.pre('save', function (next) {
  if (this.originalQuantity === undefined || this.originalQuantity === null) {
    this.originalQuantity = this.quantity || 0;
  }
  if (this.scheduledQuantity === undefined || this.scheduledQuantity === null) {
    this.scheduledQuantity = 0;
  }
  this.remainingQuantity = Math.max(0, (this.originalQuantity || 0) - (this.scheduledQuantity || 0));
  this.updatedAt = Date.now();
  next();
});

// Optimize queries
ProductionPlanSchema.index({ status: 1 });
ProductionPlanSchema.index({ requiredDate: 1 });
ProductionPlanSchema.index({ warehouseId: 1 });
ProductionPlanSchema.index({ siteId: 1 });

module.exports = mongoose.model('ProductionPlan', ProductionPlanSchema);
