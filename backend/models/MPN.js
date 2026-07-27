const mongoose = require('mongoose');

const MPNSchema = new mongoose.Schema({
  mpnCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true,
  },
  mpnName: {
    type: String,
    required: [true, 'Please provide MPN name'],
    trim: true,
  },
  manufacturerName: {
    type: String,
    required: [true, 'Please provide manufacturer name'],
    trim: true,
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: [true, 'Please link this MPN to a Material'],
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Please link this MPN to a Vendor'],
  },
  partDescription: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft', 'Deleted'],
    default: 'Active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

MPNSchema.index({ materialId: 1, vendorId: 1, manufacturerName: 1 }, { unique: false });

module.exports = mongoose.model('MPN', MPNSchema);
