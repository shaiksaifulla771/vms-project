const mongoose = require('mongoose');

const POMaterialSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0.001, 'Quantity must be greater than zero'],
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Unit price cannot be negative'],
  },
  receivedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  rejectedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  lineStatus: {
    type: String,
    enum: ['OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    default: 'OPEN',
  },
  notes: {
    type: String,
    default: '',
  },
});

const PurchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    unique: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Vendor reference is required'],
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
  },
  destinationWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  materials: [POMaterialSchema],
  totalAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  expectedDeliveryDate: {
    type: Date,
  },
  orderDate: {
    type: Date,
    default: Date.now,
  },
  sourceType: {
    type: String,
    enum: ['MANUAL', 'MRP', 'PURCHASE_REQUIREMENT', 'REORDER_POINT'],
    default: 'MANUAL',
  },
  sourceRequirementIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseRequirement',
  }],
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Approved', 'Rejected', 'Ordered', 'Partially Received', 'Received', 'Cancelled'],
    default: 'Pending',
  },
  grnHistory: [{
    grnNumber: String,
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    items: [{
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
      receivedQuantity: Number,
      rejectedQuantity: Number,
      lotNumber: String,
      batchNumber: String,
      locationBin: String,
    }],
    notes: String,
  }],
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

PurchaseOrderSchema.index({ status: 1, createdAt: -1 });
PurchaseOrderSchema.index({ vendorId: 1 });
PurchaseOrderSchema.index({ siteId: 1, destinationWarehouseId: 1 });
PurchaseOrderSchema.index({ expectedDeliveryDate: 1 });

module.exports = mongoose.model('PurchaseOrder', PurchaseOrderSchema);
