const mongoose = require('mongoose');

const ApprovalDecisionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['Approve', 'Reject'], required: true },
  stepOrder: { type: Number, required: true },
  reason: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String },
}, { _id: false });

const ApprovalRequestSchema = new mongoose.Schema({
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalWorkflow', required: true },
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  currentStep: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Escalated', 'Cancelled'],
    default: 'Pending',
  },
  decisions: [ApprovalDecisionSchema],
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

ApprovalRequestSchema.index({ entityType: 1, entityId: 1 });
ApprovalRequestSchema.index({ status: 1, 'decisions.userId': 1 });

module.exports = mongoose.model('ApprovalRequest', ApprovalRequestSchema);
