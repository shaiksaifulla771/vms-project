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
    unique: true,
  },
  components: [BOMComponentSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('BOM', BOMSchema);
