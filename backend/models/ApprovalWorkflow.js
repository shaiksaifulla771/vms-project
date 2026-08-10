const mongoose = require('mongoose');

const ApprovalStepSchema = new mongoose.Schema({
  stepOrder: { type: Number, required: true },
  requiredRole: { type: String, required: true },
  minApprovers: { type: Number, default: 1 },
  thresholdField: { type: String, default: null },
  thresholdValue: { type: Number, default: null },
  description: { type: String, default: '' },
}, { _id: false });

const ApprovalWorkflowSchema = new mongoose.Schema({
  entityType: {
    type: String,
    required: true,
    enum: ['PurchaseOrder', 'PurchaseRequest', 'ProductionOrder', 'VendorMaster', 'InventoryAdjustment', 'BOM', 'ProductionPlan'],
    unique: true,
  },
  steps: { type: [ApprovalStepSchema], validate: v => v && v.length > 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ApprovalWorkflow', ApprovalWorkflowSchema);
