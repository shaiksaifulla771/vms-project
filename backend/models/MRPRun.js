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
  targetQty: {
    type: Number,
    required: true,
    min: 0.001,
  },
  requiredDate: {
    type: Date,
    required: true,
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
    aiExplanation: String,
  },
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

module.exports = mongoose.model('MRPRun', MRPRunSchema);
