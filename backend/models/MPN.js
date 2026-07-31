const mongoose = require('mongoose');

const MPNSchema = new mongoose.Schema({
  mpnCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true,
  },
  manufacturerPartNumber: {
    type: String,
    trim: true,
    required: [true, 'Please provide Manufacturer Part Number (MPN string)'],
  },
  mpnName: {
    type: String,
    trim: true,
    default: '',
  },
  manufacturerName: {
    type: String,
    trim: true,
    required: [true, 'Please provide Manufacturer name'],
  },
  isDirectFromManufacturer: {
    type: Boolean,
    default: false,
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
  unitPrice: {
    type: Number,
    min: [0, 'Unit price cannot be negative'],
  },
  moq: {
    type: Number,
    min: [1, 'MOQ must be at least 1'],
  },
  uom: {
    type: String,
    trim: true,
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
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
  previousStatus: {
    type: String,
    default: 'Active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

MPNSchema.index({ vendorId: 1, manufacturerName: 1, manufacturerPartNumber: 1 }, { unique: false });

module.exports = mongoose.model('MPN', MPNSchema);
