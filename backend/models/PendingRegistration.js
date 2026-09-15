const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PendingRegistrationSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: { type: String, required: true, select: false },
  requestedRole: {
    type: String,
    enum: [
      'Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
      'Warehouse', 'ProcurementManager', 'Vendor', 'Planner', 
      'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
    ],
    default: 'Viewer'
  },
  otpHash: { type: String },
  otpExpires: { type: Date },
  isOtpVerified: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['PENDING_OTP', 'AWAITING_APPROVAL'],
    default: 'PENDING_OTP'
  },
  purpose: {
    type: String,
    enum: ['REGISTRATION', 'PASSWORD_RESET', 'EMAIL_CHANGE'],
    default: 'REGISTRATION'
  },
  attempts: { type: Number, default: 0 },
  resendCount: { type: Number, default: 0 },
  maxResends: { type: Number, default: 5 },
  lastOtpSentAt: { type: Date, default: Date.now },
  otpVerifiedAt: { type: Date }
}, { timestamps: true });

PendingRegistrationSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (this.passwordHash.startsWith('$2a$') || this.passwordHash.startsWith('$2b$')) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

module.exports = mongoose.model('PendingRegistration', PendingRegistrationSchema);

