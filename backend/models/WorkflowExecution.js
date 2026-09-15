const mongoose = require('mongoose');

const WorkflowExecutionSchema = new mongoose.Schema({
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true, index: true },
  triggerEvent: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: {
    type: String,
    enum: ['Running', 'Completed', 'Failed', 'Paused', 'Cancelled'],
    default: 'Running',
    index: true
  },
  currentStepIndex: { type: Number, default: 0 },
  executionHistory: [{
    stepOrder: Number,
    stepName: String,
    status: String,
    executedAt: { type: Date, default: Date.now },
    result: mongoose.Schema.Types.Mixed,
    error: String
  }],
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  error: { type: String, default: null }
}, { timestamps: true });

WorkflowExecutionSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('WorkflowExecution', WorkflowExecutionSchema);
