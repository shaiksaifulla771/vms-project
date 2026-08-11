const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  appointmentNumber: { type: String, required: true, unique: true, index: true },
  visitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
  hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  scheduledStartTime: { type: Date, required: true },
  scheduledEndTime: { type: Date, required: true },
  purpose: { type: String, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'REQUESTED', 'APPROVED', 'SCHEDULED', 'EXPECTED', 'CHECKED_IN', 'IN_VISIT', 'CHECKED_OUT', 'RESCHEDULED', 'REJECTED', 'NO_SHOW', 'CANCELLED'],
    default: 'REQUESTED',
    index: true
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalNotes: { type: String, default: '' },
  approvalTime: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', AppointmentSchema);
