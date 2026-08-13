const mongoose = require('mongoose');

const PurchaseRequestSchema = new mongoose.Schema({
  isDeleted: {
    type: Boolean,
    default: false,
  },
  requestNumber: {
    type: String,
    trim: true,
  },
  title: {
    type: String,
    default: 'MRP Auto-Generated Requisition',
    trim: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: false,
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
  },
  quantity: {
    type: Number,
    default: 1,
  },
  requiredDate: {
    type: Date,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  amount: {
    type: Number,
    default: 0,
    min: [0, 'Purchase request amount cannot be negative'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Deleted', 'Converted To PO'],
    default: 'Pending',
  },
  notes: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
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

module.exports = mongoose.model('PurchaseRequest', PurchaseRequestSchema);
