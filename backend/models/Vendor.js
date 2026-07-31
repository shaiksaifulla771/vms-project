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
    validate: {
      validator: function (v) {
        if (!v || v === '') return true;
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(v);
      },
      message: props => `${props.value} is not a valid 15-character GSTIN!`
    }
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
      role: { type: String, trim: true, default: 'Other' },
      department: { type: String, trim: true, default: 'Sourcing' },
      email: { type: String, trim: true, default: '' }
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
  ffsc2200LicenseNo: { type: String, default: '', trim: true },
  fssaiLicenseNo: { type: String, default: '', trim: true },
  hasSecondaryAddress: { type: Boolean, default: false },
  secondaryAddress: { type: String, default: '', trim: true },
  secondaryAddress2: { type: String, default: '', trim: true },
  secondaryZipCode: { type: String, default: '', trim: true },
  secondaryCity: { type: String, default: '', trim: true },
  secondaryState: { type: String, default: '', trim: true },
  secondaryCountry: { type: String, default: 'India', trim: true },
  secondaryGstOption: { type: String, default: 'same' },
  secondaryGstState: { type: String, default: '', trim: true },
  secondaryGstin: { type: String, default: '', trim: true },
  secondaryAddresses: [
    {
      address: { type: String, default: '', trim: true },
      address2: { type: String, default: '', trim: true },
      zipCode: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      state: { type: String, default: '', trim: true },
      country: { type: String, default: 'India', trim: true },
      gstOption: { type: String, default: 'same' },
      gstState: { type: String, default: '', trim: true },
      gstin: { type: String, default: '', trim: true }
    }
  ],
  fssai: { type: Boolean, default: false },
  fssaiExpiry: { type: Date, default: null },
  fssaiQty: { type: Number, default: 0 },
  bankAccountHolder: { type: String, default: '', trim: true },
  bankAccountNumber: { type: String, default: '', trim: true },
  bankName: { type: String, default: '', trim: true },
  ifscCode: { type: String, default: '', trim: true },
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

module.exports = mongoose.model('Vendor', VendorSchema);
