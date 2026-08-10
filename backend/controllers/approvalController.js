const approvalEngine = require('../services/approvalEngine');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const ApprovalRequest = require('../models/ApprovalRequest');

exports.getMyPending = async (req, res) => {
  try {
    const pending = await approvalEngine.getMyPendingApprovals(req.user._id, req.user.role);
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getApproval = async (req, res) => {
  try {
    const approval = await ApprovalRequest.findById(req.params.id).populate('workflowId decisions.userId requestedBy');
    if (!approval) return res.status(404).json({ error: 'Not found' });
    res.json(approval);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.submitDecision = async (req, res) => {
  try {
    const { action, reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const updated = await approvalEngine.processDecision(req.params.id, req.user._id, action, reason, ipAddress);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getWorkflows = async (req, res) => {
  try {
    const workflows = await ApprovalWorkflow.find().populate('createdBy');
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createWorkflow = async (req, res) => {
  try {
    const { entityType, steps, isActive } = req.body;
    const workflow = await ApprovalWorkflow.findOneAndUpdate(
      { entityType },
      { entityType, steps, isActive, createdBy: req.user._id },
      { new: true, upsert: true }
    );
    res.json(workflow);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
