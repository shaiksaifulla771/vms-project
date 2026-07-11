const mongoose = require('mongoose');

const QualityRecordSchema = new mongoose.Schema({
  productionOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionOrder',
    required: [true, 'Production order reference is required'],
    unique: true,
  },
  status: {
    type: String,
    enum: ['Passed', 'Failed'],
    required: [true, 'Quality inspection status is required'],
  },
  notes: {
    type: String,
    trim: true,
  },
  inspectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('QualityRecord', QualityRecordSchema);
