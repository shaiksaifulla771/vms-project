const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Please provide vendor name'],
    trim: true,
  },
  company: {
    type: String,
    default: '',
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
    default: '',
    trim: true,
  },
  address: {
    type: String,
    default: '',
    trim: true,
  },
  address2: {
    type: String,
    default: '',
    trim: true,
  },
  zipCode: {
    type: String,
    default: '',
    trim: true,
  },
  city: {
    type: String,
    default: '',
    trim: true,
  },
  state: {
    type: String,
    default: '',
    trim: true,
  },
  country: {
    type: String,
    default: 'India',
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
  contacts: [
    {
      name: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      role: { type: String, trim: true, default: 'Other' }
    }
  ],
  primaryContactName: { type: String, default: '', trim: true },
  primaryContactPhone: { type: String, default: '', trim: true },
  primaryContactDesignation: { type: String, default: '', trim: true },
  notes: {
    type: String,
    default: '',
    trim: true,
  },
  category: {
    type: String,
    default: 'Other',
    trim: true,
  },
  subCategory: {
    type: String,
    default: '',
    trim: true,
  },
  ffsc2200: { type: Boolean, default: false },
  ffsc2200Expiry: { type: Date, default: null },
  ffsc2200Qty: { type: Number, default: 0 },
  fssai: { type: Boolean, default: false },
  fssaiExpiry: { type: Date, default: null },
  fssaiQty: { type: Number, default: 0 },
  bankAccountHolder: { type: String, default: '', trim: true },
  bankAccountNumber: { type: String, default: '', trim: true },
  bankName: { type: String, default: '', trim: true },
  ifscCode: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Vendor', VendorSchema);
