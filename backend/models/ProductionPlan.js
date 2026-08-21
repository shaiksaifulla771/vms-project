const mongoose = require('mongoose');

const MaterialShortageSchema = new mongoose.Schema({
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
  materialCode: String,
  materialName: String,
  requiredQty: Number,
  availableQty: Number,
  shortageQty: Number,
  unit: String,
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
}, { _id: false });

const PlanIngredientSchema = new mongoose.Schema({
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
  materialCode: String,
  materialName: String,
  quantityPerPlan: { type: Number, required: true, min: 0.000001 },
  totalQuantity: { type: Number, default: 0 },
  uom: { type: String, default: 'pcs' },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  lossPercentage: { type: Number, default: 0 },
}, { _id: true });

const CustomMaterialSchema = new mongoose.Schema({
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  materialCode: String,
  materialName: String,
  quantity: { type: Number, required: true, min: 0.0001 },
  uom: { type: String, default: 'pcs' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  reason: { type: String, default: 'Manual addition outside standard BOM' },
  addedBy: { type: mongoose.Schema.Types.Mixed },
  addedAt: { type: Date, default: Date.now },
  isApproved: { type: Boolean, default: true },
}, { _id: true });

const MaterialSubstitutionSchema = new mongoose.Schema({
  originalMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  originalMaterialCode: String,
  originalMaterialName: String,
  substituteMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  substituteMaterialCode: String,
  substituteMaterialName: String,
  originalQuantity: { type: Number, required: true },
  substituteQuantity: { type: Number, required: true },
  conversionFactor: { type: Number, default: 1.0 },
  reason: { type: String, default: 'Approved engineering substitute' },
  substitutedBy: { type: mongoose.Schema.Types.Mixed },
  substitutedAt: { type: Date, default: Date.now },
  isApproved: { type: Boolean, default: true },
}, { _id: true });

const ProductionPlanSchema = new mongoose.Schema({
  planNumber: {
    type: String,
    required: true,
  },
  planName: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    default: 'Production Plan',
  },
  isTemplate: {
    type: Boolean,
    default: false,
    index: true,
  },
  isReusable: {
    type: Boolean,
    default: true,
  },
  basedOnPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionPlan',
  },
  allowPartial: {
    type: Boolean,
    default: false,
  },
  requireDifferentApprover: {
    type: Boolean,
    default: false,
  },
  mrpRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MRPRun',
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Product (Material) reference is required'],
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
  },
  productCode: String,
  productName: String,
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: false,
  },
  bom: {
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
    required: [true, 'Warehouse/Site context is required'],
  },
  totalPlans: {
    type: Number,
    required: [true, 'Total number of plans/units is required'],
    min: [1, 'Total plans must be at least 1'],
    default: 1,
  },
  availablePlans: {
    type: Number,
    min: [0, 'Available plans cannot be negative'],
  },
  reservedPlans: {
    type: Number,
    default: 0,
    min: 0,
  },
  releasedPlans: {
    type: Number,
    default: 0,
    min: 0,
  },
  completedPlans: {
    type: Number,
    default: 0,
    min: 0,
  },
  cancelledPlans: {
    type: Number,
    default: 0,
    min: 0,
  },
  ingredients: [PlanIngredientSchema],
  customMaterials: [CustomMaterialSchema],
  substitutions: [MaterialSubstitutionSchema],
  quantity: {
    type: Number,
    default: 1,
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
  seriesId: {
    type: String,
    trim: true,
    index: true,
  },
  seriesIndex: {
    type: Number,
    default: 1,
  },
  seriesTotal: {
    type: Number,
    default: 1,
  },
  requiredDate: {
    type: Date,
    required: [true, 'Required date is required'],
  },
  requiredByDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: [
      'UNSCHEDULED', 'DRAFT', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED', 'RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'REJECTED',
      'Unscheduled', 'Scheduled', 'Released', 'In Progress', 'In Production', 'Completed', 'On Hold', 'Cancelled', 'Draft', 'Pending', 'Partially Scheduled', 'Material Reserved', 'Allocated', 'Rescheduled', 'SCHEDULED'
    ],
    default: 'UNSCHEDULED',
  },
  planSource: {
    type: String,
    enum: ['MRP', 'MANUAL', 'FORECAST', 'Manual', 'Forecast'],
    default: 'MANUAL',
  },
  source: {
    type: String,
    enum: ['MRP', 'MANUAL', 'FORECAST', 'Manual', 'Forecast'],
    default: 'MANUAL',
  },
  sourceReference: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'sourceRefModel',
  },
  sourceRefModel: {
    type: String,
    enum: ['SalesOrder', 'Forecast', 'ManualDemand', 'MRPRun'],
    default: 'MRPRun',
  },
  priority: {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW', 'CRITICAL', 'High', 'Medium', 'Low', 'Critical'],
    default: 'MEDIUM',
  },
  materialStatus: {
    status: {
      type: String,
      enum: ['READY', 'SHORTAGE', 'PARTIAL', 'Ready', 'Shortage', 'Partial', 'Not Evaluated'],
      default: 'Not Evaluated',
    },
    shortages: [MaterialShortageSchema],
    checkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  schedule: {
    productionDate: Date,
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '17:00' },
    shift: { type: mongoose.Schema.Types.Mixed },
    shiftId: String,
    productionLine: { type: mongoose.Schema.Types.Mixed },
    lineId: String,
    machine: { type: mongoose.Schema.Types.Mixed },
    machineId: String,
    warehouse: { type: mongoose.Schema.Types.Mixed },
    warehouseId: { type: mongoose.Schema.Types.Mixed },
    estimatedDuration: { type: Number, default: 480 }, // minutes
    capacityCheckStatus: { type: String, default: 'Sufficient' },
    materialCheckStatus: { type: String, default: 'Ready' },
  },
  scheduledStartDate: Date,
  scheduledEndDate: Date,
  workCenter: {
    type: String,
    trim: true,
    default: 'Main Assembly Line 1',
  },
  scheduling: {
    direction: {
      type: String,
      enum: ['Forward', 'Backward'],
      default: 'Forward',
    },
    schedulingDate: Date,
    startTime: { type: String, default: '09:00' },
    durationHours: { type: Number, default: 6 },
    plannedStartDateTime: Date,
    plannedEndDateTime: Date,
    resourceGroup: { type: String, default: 'Assembly & Production' },
    selectedResource: { type: String, default: 'Main Assembly Line 1' },
    capacityRequired: { type: Number, default: 6 },
    capacityAvailable: { type: Number, default: 8 },
    materialCheckStatus: { type: String, default: 'Not Evaluated' },
    capacityCheckStatus: { type: String, default: 'Not Evaluated' },
    operations: [
      {
        seq: Number,
        name: String,
        resource: String,
        setupMins: Number,
        runMins: Number,
        startTime: String,
        endTime: String,
      }
    ]
  },
  reason: {
    type: String,
    default: '',
  },
  cancelReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.Mixed,
  },
  cancelledAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.Mixed,
  },
  approvedBy: {
    type: mongoose.Schema.Types.Mixed,
  },
  approvedAt: Date,
  releasedBy: {
    type: mongoose.Schema.Types.Mixed,
  },
  releasedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.Mixed,
  },
  completedAt: Date,
  productionOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionOrder',
  },
  releasedProductionOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionOrder',
  },
  parentPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionPlan',
  },
  parentPlanNumber: {
    type: String,
    trim: true,
  },
  splitHistory: [
    {
      splitPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionPlan' },
      planNumber: String,
      quantity: Number,
      requiredDate: Date,
      splitAt: { type: Date, default: Date.now },
      splitBy: { type: mongoose.Schema.Types.Mixed },
    }
  ],
  auditHistory: [
    {
      action: String,
      user: { type: mongoose.Schema.Types.Mixed },
      performedBy: String,
      timestamp: { type: Date, default: Date.now },
      details: String,
    }
  ],
  remarks: String,
  notes: {
    type: String,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.Mixed,
  },
  version: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true,
  optimisticConcurrency: true,
});

// Helper: Sync plan calculations
function syncPlanCalculations(doc) {
  if (doc.totalPlans === undefined || doc.totalPlans === null) {
    doc.totalPlans = doc.quantity || 1;
  }
  doc.quantity = doc.totalPlans;

  if (doc.availablePlans === undefined || doc.availablePlans === null) {
    doc.availablePlans = Math.max(0, doc.totalPlans - (doc.releasedPlans || 0) - (doc.reservedPlans || 0) - (doc.cancelledPlans || 0));
  }

  if (doc.originalQuantity === undefined || doc.originalQuantity === null) {
    doc.originalQuantity = doc.totalPlans;
  }
  if (doc.scheduledQuantity === undefined || doc.scheduledQuantity === null) {
    doc.scheduledQuantity = doc.releasedPlans || 0;
  }
  doc.remainingQuantity = Math.max(0, doc.availablePlans);

  // Default planName if missing
  if (!doc.planName) {
    doc.planName = `${doc.productName || 'Production Plan'} - ${doc.planNumber || Date.now()}`;
  }

  // Recalculate ingredient totals based on totalPlans and guarantee positive quantityPerPlan
  if (doc.ingredients && doc.ingredients.length > 0) {
    for (const ing of doc.ingredients) {
      if (ing.materialId && !ing.material) ing.material = ing.materialId;
      if (ing.material && !ing.materialId) ing.materialId = ing.material;
      
      const parsedQty = Number(ing.quantityPerPlan);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        if (ing.totalQuantity && doc.totalPlans && doc.totalPlans > 0) {
          ing.quantityPerPlan = Math.max(0.000001, Math.round((ing.totalQuantity / doc.totalPlans) * 10000) / 10000);
        } else if (ing.qty && Number(ing.qty) > 0) {
          ing.quantityPerPlan = Math.max(0.000001, Number(ing.qty));
        } else {
          ing.quantityPerPlan = 1;
        }
      } else {
        ing.quantityPerPlan = Math.max(0.000001, parsedQty);
      }

      const lossMultiplier = 1 + ((ing.lossPercentage || 0) / 100);
      ing.totalQuantity = Math.round((ing.quantityPerPlan * (doc.totalPlans || doc.quantity || 1) * lossMultiplier) * 10000) / 10000;
    }
  }

  if (!doc.product && doc.productId) doc.product = doc.productId;
  if (!doc.bom && doc.bomId) doc.bom = doc.bomId;
  if (!doc.source && doc.planSource) doc.source = doc.planSource.toUpperCase();
  if (!doc.requiredByDate && doc.requiredDate) doc.requiredByDate = doc.requiredDate;
}

ProductionPlanSchema.pre('validate', function (next) {
  syncPlanCalculations(this);
  next();
});

ProductionPlanSchema.pre('save', function (next) {
  syncPlanCalculations(this);
  this.updatedAt = Date.now();
  next();
});

// Optimize queries
ProductionPlanSchema.index({ planNumber: 1 }, { unique: true });
ProductionPlanSchema.index({ planName: 1 });
ProductionPlanSchema.index({ status: 1 });
ProductionPlanSchema.index({ requiredDate: 1 });
ProductionPlanSchema.index({ warehouseId: 1 });
ProductionPlanSchema.index({ siteId: 1 });
ProductionPlanSchema.index({ productId: 1, status: 1 });
ProductionPlanSchema.index({ 'ingredients.material': 1 });
ProductionPlanSchema.index({ totalPlans: 1, availablePlans: 1 });

module.exports = mongoose.model('ProductionPlan', ProductionPlanSchema);


