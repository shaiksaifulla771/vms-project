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
  basePrice: {
    type: Number,
    default: 0,
  },
  type: {
    type: String,
    enum: ['Raw Material', 'Packaged Material', 'Semi-Finished', 'Finished'],
    default: 'Raw Material',
  },
  subcategory: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft', 'Deleted'],
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
  manufacturer: {
    type: String,
    trim: true,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Performance Indexes for Fast Lookups, Search, and Filtering
MaterialSchema.index({ type: 1, status: 1 });
MaterialSchema.index({ name: 1, status: 1 });
MaterialSchema.index({ status: 1, createdAt: -1 });
MaterialSchema.index({ name: 'text', code: 'text', description: 'text' });

module.exports = mongoose.model('Material', MaterialSchema);
