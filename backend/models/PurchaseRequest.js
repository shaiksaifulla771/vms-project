const mongoose = require('mongoose');

const PurchaseRequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide purchase request title'],
    trim: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Request must be assigned to a vendor'],
  },
  amount: {
    type: Number,
    required: [true, 'Please provide request amount'],
    min: [0, 'Purchase request amount cannot be negative'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  description: {
    type: String,
    trim: true,
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PurchaseRequest', PurchaseRequestSchema);
