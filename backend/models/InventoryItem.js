const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse reference is required'],
  },
  batchNumber: {
    type: String,
    trim: true,
    default: 'DEFAULT',
  },
  lotNumber: {
    type: String,
    trim: true,
  },
  mfgDate: {
    type: Date,
  },
  expiryDate: {
    type: Date,
  },
  balance: {
    type: Number,
    required: [true, 'Inventory balance is required'],
    default: 0,
    min: [0, 'Inventory balance cannot fall below zero'],
  },
  reservedBalance: {
    type: Number,
    default: 0,
    min: [0, 'Reserved balance cannot fall below zero'],
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound unique index for batch-level tracking per warehouse
InventoryItemSchema.index({ materialId: 1, warehouseId: 1, batchNumber: 1 }, { unique: true });


module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
