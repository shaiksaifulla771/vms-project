const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
    unique: true,
  },
  balance: {
    type: Number,
    required: [true, 'Inventory balance is required'],
    default: 0,
    min: [0, 'Inventory balance cannot fall below zero'],
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
