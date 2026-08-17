const mongoose = require('mongoose');

// PurchaseRequest supports two creation flows:
//  1. Manual (via Purchasing UI) — requires title, vendorId, amount
//  2. MRP-generated — requires materialId, quantity, warehouseId; vendor assigned later
const PurchaseRequestSchema = new mongoose.Schema({
  isDeleted: {
    type: Boolean,
    default: false,
  },
  requestNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },
  // MRP-generated fields
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
  },
  quantity: {
    type: Number,
    min: [0, 'Quantity cannot be negative'],
  },
  requiredDate: {
    type: Date,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  mrpRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MRPRun',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  // Manual purchase request fields
  title: {
    type: String,
    trim: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  amount: {
    type: Number,
    min: [0, 'Purchase request amount cannot be negative'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Ordered', 'Deleted'],
    default: 'Pending',
  },
  source: {
    type: String,
    enum: ['Manual', 'MRP'],
    default: 'Manual',
  },
  description: {
    type: String,
    trim: true,
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

PurchaseRequestSchema.index({ materialId: 1, status: 1 });
PurchaseRequestSchema.index({ mrpRunId: 1 });
PurchaseRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PurchaseRequest', PurchaseRequestSchema);
