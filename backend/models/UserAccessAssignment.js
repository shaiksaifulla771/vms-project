const mongoose = require('mongoose');

const UserAccessAssignmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'userId is required'],
    index: true,
  },
  scopeType: {
    type: String,
    enum: ['site', 'warehouse', 'manufacturingPlant'],
    required: [true, 'scopeType is required'],
  },
  scopeId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'scopeId is required'],
    index: true,
  },
  accessLevel: {
    type: String,
    enum: ['limited', 'permitted', 'universal'],
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'transferred', 'dormant'],
    default: 'active',
    index: true,
  },
  effectiveUntil: {
    type: Date,
    default: null,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  removedAt: {
    type: Date,
    default: null,
  },
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reason: {
    type: String,
    required: [true, 'Audit justification reason is required'],
    trim: true,
  },
  transferId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAccessAssignment',
    default: null,
  },
}, { timestamps: true });

// Compound indexes for high-throughput scope lookup
UserAccessAssignmentSchema.index({ userId: 1, scopeType: 1, scopeId: 1, status: 1 });
UserAccessAssignmentSchema.index({ scopeType: 1, scopeId: 1, status: 1 });
UserAccessAssignmentSchema.index({ status: 1, effectiveUntil: 1 });

// Database-level enforcement against duplicate active assignments
UserAccessAssignmentSchema.index(
  { userId: 1, scopeType: 1, scopeId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = mongoose.model('UserAccessAssignment', UserAccessAssignmentSchema);
