const mongoose = require('mongoose');

const ContractSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide contract title'],
    trim: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Contract must be linked to a vendor'],
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide start date'],
  },
  endDate: {
    type: Date,
    required: [true, 'Please provide end date'],
  },
  status: {
    type: String,
    enum: ['Active', 'Expired', 'Pending'],
    default: 'Pending',
  },
  value: {
    type: Number,
    required: [true, 'Please provide contract value (budget)'],
    min: [0, 'Contract value cannot be negative'],
  },
  documentUrl: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Enforce date validation at Schema level
ContractSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    this.invalidate('endDate', 'Contract End Date must be after the Start Date');
  }
  next();
});

module.exports = mongoose.model('Contract', ContractSchema);
