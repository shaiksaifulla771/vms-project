const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide material name'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please provide unique material code'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  unit: {
    type: String,
    required: [true, 'Please provide unit of measurement (e.g. kg, pcs, liters)'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['Raw', 'Semi-Finished', 'Finished', 'Raw Material', 'Finished Goods', 'Packing Material'],
    default: 'Raw',
  },
  subcategory: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
  },
  description: {
    type: String,
    trim: true,
  },
  importSource: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Material', MaterialSchema);
