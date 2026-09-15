const mongoose = require('mongoose');

const InstanceComponentSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  materialCode: String,
  materialName: String,
  requiredQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  allocatedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  consumedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  uom: {
    type: String,
    default: 'pcs',
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  isCustom: {
    type: Boolean,
    default: false,
  },
  isSubstituted: {
    type: Boolean,
    default: false,
  },
  originalMaterialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
  },
}, { _id: false });

const ProductionPlanInstanceSchema = new mongoose.Schema({
  instanceNumber: {
    type: String,
    required: true,
    trim: true,
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionPlan',
    required: [true, 'Parent ProductionPlan reference is required'],
    index: true,
  },
  planNumber: {
    type: String,
    required: true,
    trim: true,
  },
  batchNumber: {
    type: String,
    trim: true,
  },
  sequence: {
    type: Number,
    default: 1,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  productCode: String,
  productName: String,
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
  },
  bomVersion: {
    type: String,
    default: '1',
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
  },
  quantity: {
    type: Number,
    required: [true, 'Instance quantity is required'],
    min: [0.0001, 'Quantity must be positive'],
  },
  completedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  rejectedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  plannedStartDate: {
    type: Date,
    required: true,
  },
  plannedEndDate: {
    type: Date,
  },
  actualStartDate: Date,
  actualEndDate: Date,
  shiftId: {
    type: String,
    default: 'Standard Shift',
  },
  workCenter: {
    type: String,
    trim: true,
    default: 'Main Assembly Line 1',
  },
  status: {
    type: String,
    enum: [
      'UNSCHEDULED',
      'DRAFT',
      'VALIDATED',
      'PENDING_APPROVAL',
      'APPROVED',
      'RELEASED',
      'IN_PROGRESS',
      'PARTIALLY_COMPLETED',
      'COMPLETED',
      'ON_HOLD',
      'CANCELLED',
      'REJECTED',
    ],
    default: 'UNSCHEDULED',
    index: true,
  },
  materialStatus: {
    status: {
      type: String,
      enum: ['READY', 'SHORTAGE', 'PARTIAL', 'Not Evaluated'],
      default: 'Not Evaluated',
    },
    shortages: [
      {
        materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
        materialCode: String,
        materialName: String,
        requiredQty: Number,
        availableQty: Number,
        shortageQty: Number,
        unit: String,
      }
    ],
    checkedAt: { type: Date, default: Date.now },
  },
  components: [InstanceComponentSchema],
  productionOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionOrder',
  },
  productionOrderNumber: String,
  holdReason: String,
  cancelReason: String,
  notes: String,
  version: {
    type: Number,
    default: 1,
  },
  auditHistory: [
    {
      action: String,
      user: { type: mongoose.Schema.Types.Mixed },
      timestamp: { type: Date, default: Date.now },
      details: String,
    }
  ],
  createdBy: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: mongoose.Schema.Types.Mixed },
  approvedBy: { type: mongoose.Schema.Types.Mixed },
  approvedAt: Date,
  releasedBy: { type: mongoose.Schema.Types.Mixed },
  releasedAt: Date,
  completedBy: { type: mongoose.Schema.Types.Mixed },
  completedAt: Date,
}, {
  timestamps: true,
  optimisticConcurrency: true,
});

ProductionPlanInstanceSchema.index({ planId: 1, sequence: 1 });
ProductionPlanInstanceSchema.index({ instanceNumber: 1 }, { unique: true });
ProductionPlanInstanceSchema.index({ warehouseId: 1, status: 1 });
ProductionPlanInstanceSchema.index({ plannedStartDate: 1 });
ProductionPlanInstanceSchema.index({ productionOrderId: 1 });

module.exports = mongoose.model('ProductionPlanInstance', ProductionPlanInstanceSchema);
