const mongoose = require('mongoose');

const WorkflowStepSchema = new mongoose.Schema({
  stepOrder: { type: Number, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['Condition', 'Approval', 'Email', 'DatabaseUpdate', 'Delay', 'Notification'],
    required: true
  },
  config: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

const WorkflowSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, index: true },
  description: { type: String, default: '' },
  triggerEvent: {
    type: String,
    enum: [
      'visitor.created',
      'visitor.updated',
      'visitor.approved',
      'visitor.rejected',
      'appointment.created',
      'appointment.approved',
      'appointment.rejected',
      'appointment.cancelled',
      'visitor.checked_in',
      'visitor.checked_out',
      'inventory.adjusted',
      'production.completed'
    ],
    required: true,
    index: true
  },
  steps: [WorkflowStepSchema],
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
    index: true
  },
  version: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Workflow', WorkflowSchema);
