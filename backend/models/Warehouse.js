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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Optimize queries
WarehouseSchema.index({ code: 1 });
WarehouseSchema.index({ isActive: 1 });

module.exports = mongoose.model('Warehouse', WarehouseSchema);
