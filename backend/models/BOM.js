const mongoose = require('mongoose');

const BOMComponentSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Component material reference is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Component quantity is required'],
    min: [0.000001, 'Quantity must be greater than zero'],
  },
});

const BOMSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Finished product reference is required'],
  },
  components: [BOMComponentSchema],
  outputQuantity: {
    type: Number,
    required: [true, 'Output batch quantity is required'],
    min: [0.000001, 'Output quantity must be greater than zero'],
  },
  outputUnit: {
    type: String,
    required: [true, 'Output unit is required'],
  },
  totalRecipeCost: {
    type: Number,
    default: 0,
  },
  calculatedUnitCost: {
    type: Number,
    default: 0,
  },
  hasMissingPrices: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['Active', 'Deleted'],
    default: 'Active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('BOM', BOMSchema);
