const mongoose = require('mongoose');

const VendorClassificationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Classification name is required'],
    trim: true,
    index: true,
  },
  code: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorClassification',
    default: null,
    index: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Deleted'],
    default: 'Active',
    index: true,
  },
}, {
  timestamps: true,
});

VendorClassificationSchema.index({ name: 1, parentId: 1 });

module.exports = mongoose.model('VendorClassification', VendorClassificationSchema);
