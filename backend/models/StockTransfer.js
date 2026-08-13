const mongoose = require('mongoose');

const StockTransferSchema = new mongoose.Schema({
  transferNumber: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  fromSiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: false,
  },
  fromWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Source warehouse reference is required'],
  },
  toSiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: false,
  },
  toWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Destination warehouse reference is required'],
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  batchNumber: {
    type: String,
    trim: true,
    default: 'DEFAULT',
  },
  quantity: {
    type: Number,
    required: [true, 'Transfer quantity is required'],
    min: [0.001, 'Quantity must be greater than zero'],
  },
  status: {
    type: String,
    enum: ['Draft', 'Pending Approval', 'Approved', 'In Transit', 'Completed', 'Rejected', 'Cancelled'],
    default: 'Pending Approval',
  },
  reason: {
    type: String,
    required: [true, 'Transfer reason is required'],
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  dispatchedAt: {
    type: Date,
  },
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  receivedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

StockTransferSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

StockTransferSchema.index({ status: 1 });
StockTransferSchema.index({ fromWarehouseId: 1 });
StockTransferSchema.index({ toWarehouseId: 1 });

module.exports = mongoose.model('StockTransfer', StockTransferSchema);
