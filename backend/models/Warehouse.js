const mongoose = require('mongoose');

const WarehouseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Warehouse code is required'],
    unique: true,
    trim: true,
    uppercase: true,
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

// Optimize queries
WarehouseSchema.index({ code: 1 });
WarehouseSchema.index({ isActive: 1 });

module.exports = mongoose.model('Warehouse', WarehouseSchema);
