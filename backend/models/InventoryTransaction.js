const mongoose = require('mongoose');

const InventoryTransactionSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Transaction quantity is required'],
  },
  type: {
    type: String,
    enum: ['purchase', 'consumption', 'production', 'adjustment'],
    required: [true, 'Transaction type is required'],
  },
  referenceId: {
    type: String, // Can store PO id, production run id, or other adjustment codes
  },
  notes: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('InventoryTransaction', InventoryTransactionSchema);
