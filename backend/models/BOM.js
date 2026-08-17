const mongoose = require('mongoose');

// BOM component sub-schema
// Accepts both qty/quantity and lossPercent/lossPercentage (normalized on save)
const BOMComponentSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: false,
  },
  mpnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MPN',
    required: false,
  },
  // Canonical quantity field — populated in pre-save from qty/quantity aliases
  quantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Alias: accepted from API payloads; normalized to `quantity` in pre-save
  qty: {
    type: Number,
    required: false,
    min: 0,
  },
  uom: {
    type: String,
    default: 'pcs',
  },
  // Canonical loss field
  lossPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 99,
  },
  // Alias: accepted from API payloads; normalized to `lossPercentage` in pre-save
  lossPercent: {
    type: Number,
    required: false,
    min: 0,
    max: 99,
  },
}, { _id: false });

const BOMSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Assembly product reference is required'],
  },
  bomNumber: {
    type: String,
    sparse: true,
    trim: true,
  },
  batchCode: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  manufacturer: {
    type: String,
    trim: true,
    default: '',
  },
  batchSize: {
    type: Number,
    required: [true, 'Batch size is required'],
    min: [0.0001, 'Batch size must be greater than zero'],
  },
  batchUOM: {
    type: String,
    required: [true, 'Batch UOM is required'],
  },
  components: {
    type: [BOMComponentSchema],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one component is required'
    }
  },
  packagingCost: {
    type: Number,
    default: 0,
    min: 0
  },
  processingCost: {
    type: Number,
    default: 0,
    min: 0
  },
  overheadCost: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Draft', 'Obsolete', 'Inactive', 'Deleted'],
    default: 'Active'
  },
  previousStatus: {
    type: String,
    enum: ['Active', 'Draft', 'Inactive', null],
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  },
  version: {
    type: Number,
    default: 1
  },
  previousVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    default: null
  },
  duplicatedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    default: null
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
    default: 'System'
  },
  updatedBy: {
    type: String,
    default: 'System'
  }
}, {
  timestamps: true,
  optimisticConcurrency: true
});

// Pre-save: normalize qty→quantity, lossPercent→lossPercentage, and auto-resolve materialId from mpnId
BOMSchema.pre('save', async function(next) {
  if (this.components && Array.isArray(this.components)) {
    for (const comp of this.components) {
      if (!comp.materialId && comp.mpnId) {
        try {
          const MPN = mongoose.model('MPN');
          const mpnDoc = await MPN.findById(comp.mpnId).select('materialId').lean();
          if (mpnDoc && mpnDoc.materialId) {
            comp.materialId = mpnDoc.materialId;
          }
        } catch (e) {
          // Ignore lookup failure in pre-save
        }
      }
      // qty is the canonical API-level input; quantity is the stored canonical name
      if (comp.qty !== undefined && comp.qty !== null) {
        if (!comp.quantity || comp.quantity === 0) {
          comp.quantity = comp.qty;
        }
      }
      if (!comp.quantity || comp.quantity === 0) {
        if (comp.qty) comp.quantity = comp.qty;
      }
      // lossPercent is the canonical API-level input
      if (comp.lossPercent !== undefined && comp.lossPercent !== null) {
        if (!comp.lossPercentage) {
          comp.lossPercentage = comp.lossPercent;
        }
      }
    }
  }
  if (typeof next === 'function') next();
});

// Indexes for performance
BOMSchema.index({ productId: 1, status: 1 });
BOMSchema.index({ status: 1, createdAt: -1 });
BOMSchema.index({ 'components.materialId': 1 });
BOMSchema.index({ bomNumber: 1, version: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('BOM', BOMSchema);
