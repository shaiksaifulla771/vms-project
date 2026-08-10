const mongoose = require('mongoose');

const PlanningRequirementSchema = new mongoose.Schema({
  mrpRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MRPRun',
    required: true,
  },
  sourceKey: {
    type: String,
    required: true, // Unique combination key to ensure idempotency (e.g. mrpRunId_materialId)
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  materialCode: String,
  materialName: String,
  unit: String,
  requiredQty: {
    type: Number,
    required: true,
  },
  availableQty: {
    type: Number,
    default: 0,
  },
  reservedQty: {
    type: Number,
    default: 0,
  },
  onOrderQty: {
    type: Number,
    default: 0,
  },
  netQty: {
    type: Number,
    default: 0,
  },
  shortageQty: {
    type: Number,
    default: 0,
  },
  suggestedLeadTimeDays: {
    type: Number,
    default: 7,
  },
  action: {
    type: String,
    enum: ['Sufficient', 'Procure', 'Produce', 'Partial Stock'],
    default: 'Sufficient',
  },
  status: {
    type: String,
    enum: ['Pending', 'Converted To Plan', 'Converted To PO', 'Dismissed'],
    default: 'Pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

PlanningRequirementSchema.index({ mrpRunId: 1 });
PlanningRequirementSchema.index({ sourceKey: 1 }, { unique: true });

module.exports = mongoose.model('PlanningRequirement', PlanningRequirementSchema);
