const mongoose = require('mongoose');

const BOMVersionSchema = new mongoose.Schema({
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: true,
  },
  version: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Effective', 'Obsolete', 'Draft'],
    default: 'Active',
  },
  effectiveFrom: {
    type: Date,
    default: Date.now,
  },
  effectiveTo: Date,
  components: [
    {
      materialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      uom: {
        type: String,
        default: 'pcs',
      },
      lossPercentage: {
        type: Number,
        default: 0,
      },
      effectiveQty: {
        type: Number,
      },
      unitCost: {
        type: Number,
        default: 0,
      },
    },
  ],
  changeReason: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

BOMVersionSchema.index({ bomId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('BOMVersion', BOMVersionSchema);
