const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide vendor name'],
    trim: true,
  },
  company: {
    type: String,
    required: [true, 'Please provide company name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide vendor email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address',
    ],
  },
  phone: {
    type: String,
    required: [true, 'Please provide vendor phone number'],
  },
  address: {
    type: String,
    required: [true, 'Please provide vendor address'],
  },
  address2: {
    type: String,
    default: '',
    trim: true,
  },
  state: {
    type: String,
    default: '',
    trim: true,
  },
  gstin: {
    type: String,
    default: '',
    trim: true,
  },
  gstList: [
    {
      state: { type: String, trim: true, default: '' },
      gstin: { type: String, trim: true, default: '' }
    }
  ],
  hasNoGst: {
    type: Boolean,
    default: false
  },
  primaryContactName: {
    type: String,
    default: '',
    trim: true,
  },
  primaryContactPhone: {
    type: String,
    default: '',
    trim: true,
  },
  primaryContactDesignation: {
    type: String,
    default: '',
    trim: true,
  },
  notes: {
    type: String,
    default: '',
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Please provide vendor category'],
    enum: ['Food Processor', 'Contract Manufacturer', 'Retail Brand', 'Fresh Fruits Supplier', 'Other'],
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Vendor', VendorSchema);
