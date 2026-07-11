const mongoose = require('mongoose');

const ProductionOrderSchema = new mongoose.Schema({
  bomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BOM',
    required: [true, 'BOM reference is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Production target quantity is required'],
    min: [1, 'Target quantity must be at least 1'],
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'QC Checked'],
    default: 'Pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ProductionOrder', ProductionOrderSchema);
