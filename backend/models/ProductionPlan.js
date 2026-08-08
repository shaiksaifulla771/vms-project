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
  requiredDate: {
    type: Date,
    required: [true, 'Required date is required'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Scheduled', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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

// Update timestamp on save
ProductionPlanSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Optimize queries
ProductionPlanSchema.index({ status: 1 });
ProductionPlanSchema.index({ requiredDate: 1 });
ProductionPlanSchema.index({ warehouseId: 1 });

module.exports = mongoose.model('ProductionPlan', ProductionPlanSchema);
