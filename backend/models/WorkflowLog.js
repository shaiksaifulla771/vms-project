const mongoose = require('mongoose');

const WorkflowLogSchema = new mongoose.Schema({
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
  executionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowExecution', required: true, index: true },
  stepName: { type: String, required: true },
  actionType: { type: String, required: true },
  status: { type: String, enum: ['Success', 'Failed', 'Skipped'], required: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('WorkflowLog', WorkflowLogSchema);
