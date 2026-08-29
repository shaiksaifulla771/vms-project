const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide material name'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please provide unique material code'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  unit: {
    type: String,
    required: false,
    default: 'pcs',
    trim: true,
  },
  uom: {
    type: String,
    default: 'pcs',
    trim: true,
  },
  basePrice: {
    type: Number,
    default: 0,
  },
  price: {
    type: Number,
    default: 0,
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MaterialClassification',
    default: null,
    index: true,
  },
  vendorIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    index: true,
  }],
  type: {
    type: String,
    enum: ['Raw Material', 'Packaged Material', 'Semi-Finished', 'Finished'],
    default: 'Raw Material',
  },
  subcategory: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
  },
  description: {
    type: String,
    trim: true,
  },
  importSource: {
    type: String,
    trim: true,
  },
  manufacturer: {
    type: String,
    trim: true,
    default: '',
  },
  // Planning & Procurement Parameters
  safetyStock: {
    type: Number,
    default: 0,
    min: 0,
  },
  minOrderQty: {
    type: Number,
    default: 1,
    min: 0.001,
  },
  moq: {
    type: Number,
    default: 1,
    min: 0.001,
  },
  lotSize: {
    type: Number,
    default: 1,
    min: 0.001,
  },
  leadTimeDays: {
    type: Number,
    default: 7,
    min: 0,
  },
  makeOrBuy: {
    type: String,
    enum: ['MAKE', 'BUY'],
    default: 'BUY',
  },
  defaultVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  reorderPoint: {
    type: Number,
    default: 0,
    min: 0,
  },
  reorderQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  storageConditions: {
    type: String,
    trim: true,
    default: 'Ambient',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  deactivatedAt: {
    type: Date,
    default: null,
  },
  deactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  deactivationReason: {
    type: String,
    trim: true,
    default: '',
  },
});

// Pre-save normalization: sync uom <-> unit and price <-> basePrice
MaterialSchema.pre('save', function (next) {
  if (this.uom && !this.unit) {
    this.unit = this.uom;
  } else if (this.unit && !this.uom) {
    this.uom = this.unit;
  }
  if (this.price !== undefined && !this.basePrice) {
    this.basePrice = this.price;
  } else if (this.basePrice !== undefined && !this.price) {
    this.price = this.basePrice;
  }
  next();
});

// Performance Indexes for Fast Lookups, Search, and Filtering
MaterialSchema.index({ type: 1, status: 1 });
MaterialSchema.index({ name: 1, status: 1 });
MaterialSchema.index({ status: 1, createdAt: -1 });
MaterialSchema.index({ name: 'text', code: 'text', description: 'text' });

const blockHardDelete = function(next) { next(new Error('Hard deletion is prohibited by enterprise governance. Use soft deactivation.')); };
MaterialSchema.pre('deleteOne', { document: true, query: true }, blockHardDelete);
MaterialSchema.pre('deleteMany', blockHardDelete);
MaterialSchema.pre('findOneAndDelete', blockHardDelete);

module.exports = mongoose.model('Material', MaterialSchema);
