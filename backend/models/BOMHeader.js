const mongoose = require('mongoose');

const BOMHeaderSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Assembly product reference (Material) is required'],
    index: true,
  },
  bomNumber: {
    type: String,
    trim: true,
    sparse: true,
  },
  version: {
    type: String,
    default: '1',
    trim: true,
  },
  batchSize: {
    type: Number,
    default: 1,
    min: 0.0001,
  },
  batchUOM: {
    type: String,
    default: 'pcs',
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Draft', 'Obsolete', 'Inactive', 'Deleted'],
    default: 'Active',
    index: true,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  packagingCost: {
    type: Number,
    default: 0,
    min: 0,
  },
  processingCost: {
    type: Number,
    default: 0,
    min: 0,
  },
  overheadCost: {
    type: Number,
    default: 0,
    min: 0,
  },
  createdBy: {
    type: String,
    default: 'System',
  },
  updatedBy: {
    type: String,
    default: 'System',
  },
}, {
  timestamps: true,
});

BOMHeaderSchema.index({ productId: 1, version: 1 }, { unique: true, sparse: true });
BOMHeaderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('BOMHeader', BOMHeaderSchema);
