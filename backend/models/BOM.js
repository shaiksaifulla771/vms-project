const mongoose = require('mongoose');

const BOMComponentSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: false,
    index: true,
  },
  mpnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MPN',
    required: false,
    index: true,
  },
  qty: {
    type: Number,
    required: true,
    min: 0.0001,
  },
  quantity: {
    type: Number,
  },
  uom: {
    type: String,
    default: 'pcs',
  },
  lossPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 99,
  },
  lossPercentage: {
    type: Number,
    default: 0,
  },
}, { _id: false });

BOMComponentSchema.pre('save', function (next) {
  if (this.qty && !this.quantity) this.quantity = this.qty;
  if (this.quantity && !this.qty) this.qty = this.quantity;
  if (this.lossPercent && !this.lossPercentage) this.lossPercentage = this.lossPercent;
  if (this.lossPercentage && !this.lossPercent) this.lossPercent = this.lossPercentage;
  next();
});

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
    enum: ['Active', 'Draft', 'Inactive'],
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

// Indexes for performance
BOMSchema.index({ productId: 1 });
BOMSchema.index({ status: 1 });
BOMSchema.index({ bomNumber: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('BOM', BOMSchema);
