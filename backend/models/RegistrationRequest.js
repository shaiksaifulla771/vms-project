const mongoose = require('mongoose');

const RegistrationRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required for registration request'],
    index: true,
  },
  requestedRole: {
    type: String,
    enum: ['viewer', 'editor', 'admin', 'Viewer', 'Editor', 'Admin'],
    required: [true, 'Requested role is required'],
    default: 'viewer',
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'pending',
    index: true,
  },
  note: {
    type: String,
    trim: true,
    default: '',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  ipAddress: {
    type: String,
    trim: true,
  },
  userAgent: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

RegistrationRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('RegistrationRequest', RegistrationRequestSchema);
