const mongoose = require('mongoose');

const MRPRunSchema = new mongoose.Schema({
  runNumber: {
    type: String,
    required: true,
    unique: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: true,
  },
  bomVersion: {
    type: Number,
    default: 1,
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
  warehouses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  }],
  targetQty: {
    type: Number,
    required: true,
    min: 0.001,
  },
  requiredDate: {
    type: Date,
    required: true,
  },
  horizonDays: {
    type: Number,
    default: 30,
  },
  parameters: {
    demandIds: [String],
    includeSafetyStock: { type: Boolean, default: true },
    applyLotSizing: { type: Boolean, default: true },
    multiLevel: { type: Boolean, default: true },
  },
  algorithmVersion: {
    type: String,
    default: 'MRP-2.1',
  },
  planningRuleVersion: {
    type: String,
    default: 'RULESET-1.4',
  },
  idempotencyKey: {
    type: String,
  },
  inputHash: {
    type: String,
  },
  inputSnapshot: {
    type: mongoose.Schema.Types.Mixed, // Immutable snapshot of demand, inventory balances & open supply at run time
  },
  candidateProposal: {
    type: mongoose.Schema.Types.Mixed, // Generated candidate plan before commit
  },
  status: {
    type: String,
    enum: ['In Progress', 'Completed', 'Failed', 'Converted'],
    default: 'Completed',
  },
  summary: {
    totalComponents: Number,
    totalShortages: Number,
    hasShortage: Boolean,
    totalProductionPlans: Number,
    totalPurchaseRequirements: Number,
    aiExplanation: String,
  },
  exceptions: [
    {
      code: String,
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
      materialName: String,
      message: String,
      severity: { type: String, enum: ['INFO', 'WARNING', 'ERROR'], default: 'WARNING' },
    }
  ],
  executedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

MRPRunSchema.index({ createdAt: -1 });
MRPRunSchema.index({ productId: 1, createdAt: -1 });
MRPRunSchema.index({ warehouseId: 1 });
MRPRunSchema.index({ idempotencyKey: 1 });

module.exports = mongoose.model('MRPRun', MRPRunSchema);

