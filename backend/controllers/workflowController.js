const workflowEngineService = require('../services/workflowEngineService');
const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const asyncHandler = require('../middleware/asyncHandler');

exports.getWorkflows = asyncHandler(async (req, res) => {
  const workflows = await Workflow.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: workflows.length, data: workflows });
});

exports.createWorkflow = asyncHandler(async (req, res) => {
  const workflow = await workflowEngineService.createWorkflow(req.body, req.user._id);
  res.status(201).json({ success: true, data: workflow });
});

exports.updateWorkflow = asyncHandler(async (req, res) => {
  const workflow = await workflowEngineService.updateWorkflow(req.params.id, req.body, req.user._id);
  res.status(200).json({ success: true, data: workflow });
});

exports.deleteWorkflow = asyncHandler(async (req, res) => {
  await workflowEngineService.deleteWorkflow(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Workflow deleted' });
});

exports.enableWorkflow = asyncHandler(async (req, res) => {
  const workflow = await workflowEngineService.enableWorkflow(req.params.id, req.user._id);
  res.status(200).json({ success: true, data: workflow });
});

exports.disableWorkflow = asyncHandler(async (req, res) => {
  const workflow = await workflowEngineService.disableWorkflow(req.params.id, req.user._id);
  res.status(200).json({ success: true, data: workflow });
});

exports.getExecutions = asyncHandler(async (req, res) => {
  const executions = await WorkflowExecution.find().populate('workflowId', 'name code').sort({ createdAt: -1 }).limit(100);
  res.status(200).json({ success: true, count: executions.length, data: executions });
});

exports.executeWorkflow = asyncHandler(async (req, res) => {
  const { triggerEvent, payload } = req.body;
  const executions = await workflowEngineService.executeWorkflow(triggerEvent, payload || {}, req.user._id);
  res.status(200).json({ success: true, count: executions.length, data: executions });
});
