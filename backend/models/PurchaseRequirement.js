const mongoose = require('mongoose');

const PurchaseRequirementSchema = new mongoose.Schema({
  requirementNumber: {
    type: String,
    unique: true,
    required: true,
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  materialCode: String,
  materialName: String,
  quantity: {
    type: Number,
    required: true,
    min: 0.001,
  },
  unit: {
    type: String,
    default: 'pcs',
  },
  requiredDate: {
    type: Date,
    required: true,
  },
  suggestedVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  suggestedVendorName: String,
  estimatedUnitPrice: {
    type: Number,
    default: 0,
  },
  estimatedTotalCost: {
    type: Number,
    default: 0,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
  },
  mrpRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MRPRun',
  },
  sourceKey: {
    type: String,
    index: true,
  },
  status: {
    type: String,
    enum: ['OPEN', 'CONVERTED_TO_PO', 'CANCELLED', 'REJECTED'],
    default: 'OPEN',
  },
  convertedPurchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
  },
  notes: {
    type: String,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

PurchaseRequirementSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

PurchaseRequirementSchema.index({ status: 1 });
PurchaseRequirementSchema.index({ materialId: 1 });
PurchaseRequirementSchema.index({ requiredDate: 1 });
PurchaseRequirementSchema.index({ mrpRunId: 1 });

module.exports = mongoose.model('PurchaseRequirement', PurchaseRequirementSchema);
