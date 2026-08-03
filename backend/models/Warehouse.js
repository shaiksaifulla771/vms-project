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
  location: {
    type: String,
    trim: true,
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
