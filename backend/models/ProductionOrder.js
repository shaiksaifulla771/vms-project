const mongoose = require('mongoose');

const POComponentSchema = new mongoose.Schema({
  mpnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MPN',
    required: true,
  },
  expectedQuantity: {
    type: Number,
    required: true,
  },
  actualQuantity: {
    type: Number,
  },
  lossPercent: {
    type: Number,
    default: 0,
  },
  expectedCost: {
    type: Number,
    required: true,
  },
  actualCost: {
    type: Number,
  }
}, { _id: false });

const ProductionOrderSchema = new mongoose.Schema({
  prdNumber: {
    type: String,
    unique: true,
    index: true,
  },
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: [true, 'BOM reference is required'],
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Product (Material) reference is required'],
  },
  sourceWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Source warehouse is required'],
  },
  destinationWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Destination warehouse is required'],
  },
  targetQuantity: {
    type: Number,
    required: [true, 'Target quantity is required'],
    min: [0.001, 'Target quantity must be greater than zero'],
  },
  actualQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  scrapQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  wasteQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  yieldPercent: {
    type: Number,
  },
  wasteReason: {
    type: String,
  },
  varianceReason: {
    type: String,
  },
  batchNumber: {
    type: String,
    trim: true,
  },
  lotNumber: {
    type: String,
    trim: true,
  },
  mfgDate: {
    type: Date,
  },
  expiryDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: [
      'Draft', 
      'Pending Approval', 
      'Approved', 
      'Material Allocated', 
      'In Production', 
      'Quality Check', 
      'Completed', 
      'Closed'
    ],
    default: 'Draft',
  },
  components: [POComponentSchema],
  expectedCost: {
    type: Number,
    default: 0,
  },
  actualCost: {
    type: Number,
    default: 0,
  },
  materialVariance: {
    type: Number,
    default: 0,
  },
  costVariance: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  startedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  qcApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isPerformanceTest: {
    type: Boolean,
    default: false,
  },
  testRunId: {
    type: String,
  }
});

// Enable optimistic locking for concurrency control
ProductionOrderSchema.set('optimisticConcurrency', true);

// Optimize queries
ProductionOrderSchema.index({ status: 1 });
ProductionOrderSchema.index({ bomId: 1 });
ProductionOrderSchema.index({ productId: 1 });
ProductionOrderSchema.index({ sourceWarehouseId: 1 });
ProductionOrderSchema.index({ destinationWarehouseId: 1 });
ProductionOrderSchema.index({ createdAt: -1 });
ProductionOrderSchema.index({ isPerformanceTest: 1 });

module.exports = mongoose.model('ProductionOrder', ProductionOrderSchema);
