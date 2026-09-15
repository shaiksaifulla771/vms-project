const mongoose = require('mongoose');

const MPNPriceHistorySchema = new mongoose.Schema({
  mpnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MPN',
    required: true,
    index: true
  },
  previousPrice: {
    type: Number,
    default: null
  },
  newPrice: {
    type: Number,
    required: true
  },
  effectiveDate: {
    type: Date,
    required: true,
    index: true
  },
  modifiedBy: {
    type: String,
    required: true,
    default: 'System'
  }
}, { timestamps: true });

// Ensure optimal querying
MPNPriceHistorySchema.index({ mpnId: 1, effectiveDate: -1 });

module.exports = mongoose.model('MPNPriceHistory', MPNPriceHistorySchema);
