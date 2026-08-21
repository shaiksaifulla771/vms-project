const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    trim: true,
  },
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address',
    ],
  },
  password: {
    type: String,
    select: false,
  },
  role: {
    type: String,
    enum: ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'],
    default: 'Viewer',
  },
  requestedRole: {
    type: String,
    enum: ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator', null],
    default: null,
  },
  accountStatus: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DISABLED', 'DEACTIVATED', 'Pending', 'Active', 'Suspended', 'Deactivated'],
    default: 'PENDING',
  },
  approvalStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'Pending', 'Approved', 'Rejected'],
    default: 'PENDING',
  },
  approvedAt: {
    type: Date,
    default: null,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  rejectionReason: {
    type: String,
    trim: true,
    default: null,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    type: String,
    select: false,
  },
  otpExpires: {
    type: Date,
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  userCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    trim: true,
  },
  resetPasswordToken: {
    type: String,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },
  siteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Site' }],
  warehouseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }],
  scopeAssignedBy: { type: String, default: 'System Admin' },
  scopeAssignedAt: { type: Date, default: Date.now },
  scopeReason: { type: String, default: '' },
  fieldSecurityLevel: { type: String, enum: ['Public', 'Internal', 'Confidential', 'Restricted'], default: 'Internal' },
  refreshTokenHash: { type: String, select: false },
  tokenVersion: { type: Number, default: 0 },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: { type: String, select: false },
  lastLoginAt: Date,
  lastLoginIp: String,
  lastActivityAt: { type: Date, default: Date.now },
  lastActivityIp: String,
  lastActivityUserAgent: String,
}, {
  toJSON: {
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.otp;
      delete ret.otpExpires;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.refreshTokenHash;
      delete ret.mfaSecret;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.otp;
      delete ret.otpExpires;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.refreshTokenHash;
      delete ret.mfaSecret;
      delete ret.__v;
      return ret;
    }
  }
});

// Normalize accountStatus to UPPERCASE before saving
UserSchema.pre('save', function (next) {
  if (this.accountStatus) {
    this.accountStatus = this.accountStatus.toUpperCase();
  }
  next();
});

// Encrypt password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  if (this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$'))) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
