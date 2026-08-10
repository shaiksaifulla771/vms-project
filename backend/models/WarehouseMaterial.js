const mongoose = require('mongoose');

const WarehouseMaterialSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Material reference is required'],
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: [true, 'Site reference is required'],
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse reference is required'],
  },
  minStock: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxStock: {
    type: Number,
    default: 0,
    min: 0,
  },
  reorderPoint: {
    type: Number,
    default: 0,
    min: 0,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
});

WarehouseMaterialSchema.index({ materialId: 1, warehouseId: 1 }, { unique: true });
WarehouseMaterialSchema.index({ warehouseId: 1 });
WarehouseMaterialSchema.index({ siteId: 1 });

module.exports = mongoose.model('WarehouseMaterial', WarehouseMaterialSchema);
