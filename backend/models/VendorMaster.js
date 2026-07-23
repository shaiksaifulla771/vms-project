const mongoose = require('mongoose');

const VendorMasterSchema = new mongoose.Schema({
  Vendor_ID: {
    type: String,
    required: [true, 'Please provide Vendor ID'],
    unique: true,
    trim: true,
  },
  Company_Name: {
    type: String,
    required: [true, 'Please provide Company Name'],
    trim: true,
  },
  Tax_ID: {
    type: String,
    required: [true, 'Please provide Tax ID'],
    unique: true,
    trim: true,
  },
  Contact_Email: {
    type: String,
    required: [true, 'Please provide Contact Email'],
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address',
    ],
  },
  Department: {
    type: String,
    default: '',
    trim: true,
  },
  Role: {
    type: String,
    default: '',
    trim: true,
  },
  Status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
  },
  is_deleted: {
    type: Boolean,
    default: false, // false = 0 (Active), true = 1 (Soft-Deleted/Archived)
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('VendorMaster', VendorMasterSchema);
