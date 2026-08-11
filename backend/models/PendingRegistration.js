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
    enum: ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'],
    default: 'Viewer'
  },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  lastOtpSentAt: { type: Date, default: Date.now }
}, { timestamps: true });

PendingRegistrationSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (this.passwordHash.startsWith('$2a$') || this.passwordHash.startsWith('$2b$')) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

module.exports = mongoose.model('PendingRegistration', PendingRegistrationSchema);
