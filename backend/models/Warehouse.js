const mongoose = require('mongoose');

const WarehouseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: false,
    sparse: true,
    trim: true,
    uppercase: true,
    index: true,
  },
  warehouseId: {
    type: String,
    sparse: true,
    trim: true,
    uppercase: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Warehouse name is required'],
    trim: true,
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: false,
    index: true,
  },
  parentSiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: false,
    index: true,
  },
  type: {
    type: String,
    enum: ['Raw', 'FG', 'WIP', 'General', 'Quarantine', 'Scrap', 'Transit'],
    default: 'General',
  },
  location: {
    type: String,
    trim: true,
  },
  addressOverride: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  isActive: {
    type: Boolean,
    default: true,
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
  siteTransferHistory: [
    {
      previousSiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
      newSiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
      transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      transferredAt: { type: Date, default: Date.now },
      reason: { type: String, required: true },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save: sync warehouseId <-> code and parentSiteId <-> siteId
WarehouseSchema.pre('save', function (next) {
  if (this.warehouseId && !this.code) {
    this.code = this.warehouseId;
  } else if (this.code && !this.warehouseId) {
    this.warehouseId = this.code;
  }
  if (this.parentSiteId && !this.siteId) {
    this.siteId = this.parentSiteId;
  } else if (this.siteId && !this.parentSiteId) {
    this.parentSiteId = this.siteId;
  }
  next();
});

// Optimize queries
WarehouseSchema.index({ isActive: 1 });

const blockHardDelete = function(next) { next(new Error('Hard deletion is prohibited by enterprise governance. Use soft deactivation.')); };
WarehouseSchema.pre('deleteOne', { document: true, query: true }, blockHardDelete);
WarehouseSchema.pre('deleteMany', blockHardDelete);
WarehouseSchema.pre('findOneAndDelete', blockHardDelete);

module.exports = mongoose.model('Warehouse', WarehouseSchema);
