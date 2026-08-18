const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
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
  onHand: {
    type: Number,
    default: 0,
    min: [0, 'On-hand quantity cannot fall below zero'],
  },
  available: {
    type: Number,
    default: 0,
    min: [0, 'Available quantity cannot fall below zero'],
  },
  reserved: {
    type: Number,
    default: 0,
    min: [0, 'Reserved quantity cannot fall below zero'],
  },
  allocated: {
    type: Number,
    default: 0,
    min: [0, 'Allocated quantity cannot fall below zero'],
  },
  blocked: {
    type: Number,
    default: 0,
    min: [0, 'Blocked quantity cannot fall below zero'],
  },
  reservedBalance: {
    type: Number,
    default: 0,
    min: [0, 'Reserved balance cannot fall below zero'],
  },
  uom: {
    type: String,
    default: 'pcs',
  },
  version: {
    type: Number,
    default: 1, // Optimistic concurrency control
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Sync balance, onHand, and available automatically
InventoryItemSchema.pre('save', function (next) {
  if (this.onHand !== undefined) {
    this.balance = this.onHand;
  } else if (this.balance !== undefined) {
    this.onHand = this.balance;
  }
  if (this.reserved !== undefined) {
    this.reservedBalance = this.reserved;
  } else if (this.reservedBalance !== undefined) {
    this.reserved = this.reservedBalance;
  }
  const onHand = this.onHand || this.balance || 0;
  const reserved = this.reserved || this.reservedBalance || 0;
  const allocated = this.allocated || 0;
  const blocked = this.blocked || 0;
  this.available = Math.max(0, onHand - reserved - allocated - blocked);
  this.updatedAt = Date.now();
  next();
});

// Compound unique index for batch-level tracking per warehouse
InventoryItemSchema.index({ materialId: 1, warehouseId: 1, batchNumber: 1 }, { unique: true });
InventoryItemSchema.index({ siteId: 1, warehouseId: 1 });
InventoryItemSchema.index({ warehouseId: 1 });
InventoryItemSchema.index({ materialId: 1 });
InventoryItemSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
