const mongoose = require('mongoose');

const FlatBOMNodeSchema = new mongoose.Schema({
  level: { type: Number, required: true, default: 1 },
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  mpnId: { type: mongoose.Schema.Types.ObjectId, ref: 'MPN' },
  materialCode: { type: String, default: '' },
  materialName: { type: String, default: '' },
  materialType: { type: String, default: 'Raw Material' },
  quantity: { type: Number, required: true, default: 0 },
  unit: { type: String, default: 'pcs' },
  lossPercentage: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  lineCost: { type: Number, default: 0 },
  isSubassembly: { type: Boolean, default: false },
  subassemblyBomId: { type: mongoose.Schema.Types.ObjectId, ref: 'BOM' },
  parentMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
}, { _id: false });

const FlatBOMSchema = new mongoose.Schema({
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: true,
    unique: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  batchSize: {
    type: Number,
    required: true,
    default: 1,
  },
  batchUOM: {
    type: String,
    default: 'pcs',
  },
  nodes: [FlatBOMNodeSchema],
  totalCost: {
    type: Number,
    default: 0,
  },
  costPerUnit: {
    type: Number,
    default: 0,
  },
  calculatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

FlatBOMSchema.index({ productId: 1 });

module.exports = mongoose.model('FlatBOM', FlatBOMSchema);
