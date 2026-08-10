const mongoose = require('mongoose');

const VisitorSchema = new mongoose.Schema({
  visitorCode: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  phone: { type: String, required: true, trim: true },
  company: { type: String, default: '' },
  governmentId: { type: String, default: '' },
  hostEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  status: {
    type: String,
    enum: ['Registered', 'Pending Approval', 'Approved', 'Rejected', 'Checked In', 'Checked Out', 'Cancelled'],
    default: 'Registered',
    index: true
  },
  checkInTime: { type: Date },
  checkOutTime: { type: Date },
  badgeNumber: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Visitor', VisitorSchema);
