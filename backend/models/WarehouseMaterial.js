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

WarehouseMaterialSchema.index({ materialId: 1, warehouseId: 1 }, { unique: true });
WarehouseMaterialSchema.index({ warehouseId: 1 });
WarehouseMaterialSchema.index({ siteId: 1 });

const blockHardDelete = function(next) { next(new Error('Hard deletion is prohibited by enterprise governance. Use soft deactivation.')); };
WarehouseMaterialSchema.pre('deleteOne', { document: true, query: true }, blockHardDelete);
WarehouseMaterialSchema.pre('deleteMany', blockHardDelete);
WarehouseMaterialSchema.pre('findOneAndDelete', blockHardDelete);

module.exports = mongoose.model('WarehouseMaterial', WarehouseMaterialSchema);
