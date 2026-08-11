const mongoose = require('mongoose');

const SiteSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Site code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Site name is required'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['Manufacturing Plant', 'Distribution Center', 'Warehouse Depot', 'R&D Center', 'Regional Office', 'Other'],
    default: 'Manufacturing Plant',
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    postalCode: { type: String, trim: true },
  },
  geo: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    formattedAddress: { type: String, trim: true },
    geocoded: { type: Boolean, default: false },
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
  },
  contacts: [
    {
      name: String,
      email: String,
      phone: String,
      role: String,
    },
  ],
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  deactivatedAt: {
    type: Date,
    default: null,
  },
  deactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  deactivationReason: {
    type: String,
    trim: true,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

SiteSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Site', SiteSchema);
