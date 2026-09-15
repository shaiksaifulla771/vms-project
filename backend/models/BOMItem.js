const mongoose = require('mongoose');

const BOMItemSchema = new mongoose.Schema({
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOMHeader',
    required: [true, 'BOM Header ID is required'],
    index: true,
  },
  itemType: {
    type: String,
    enum: ['material', 'bom'],
    required: [true, 'Item type must be either material or bom'],
    default: 'material',
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    default: null,
    index: true,
  },
  childBomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOMHeader',
    default: null,
    index: true,
  },
  quantity: {
    type: Number,
    required: [true, 'Component quantity is required'],
    min: [0, 'Quantity cannot be negative'],
  },
  uom: {
    type: String,
    default: 'pcs',
    trim: true,
  },
  lossPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 99,
  },
  position: {
    type: Number,
    default: 1,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
}, {
  timestamps: true,
});

BOMItemSchema.index({ bomId: 1, position: 1 });
BOMItemSchema.index({ materialId: 1 });
BOMItemSchema.index({ childBomId: 1 });

module.exports = mongoose.model('BOMItem', BOMItemSchema);
