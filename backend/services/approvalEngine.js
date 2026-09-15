const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const ApprovalRequest = require('../models/ApprovalRequest');
const sodMatrix = require('../config/sodMatrix');

/**
 * Submit an entity for approval matching an active ApprovalWorkflow
 */
const submitForApproval = async (entityType, entityId, requestedBy) => {
  const workflow = await ApprovalWorkflow.findOne({ entityType, isActive: true });
  if (!workflow) {
    throw new Error(`No active approval workflow configured for ${entityType}`);
  }

  const approvalRequest = new ApprovalRequest({
    workflowId: workflow._id,
    entityType,
    entityId,
    requestedBy,
    currentStep: 1,
    status: 'Pending',
    decisions: []
  });

  await approvalRequest.save();
  return approvalRequest;
};

/**
 * Process an approval/rejection decision on an active request
 */
const processDecision = async (approvalRequestId, userId, action, reason = '', ipAddress = '') => {
  const request = await ApprovalRequest.findById(approvalRequestId).populate('workflowId');
  if (!request) throw new Error('Approval request not found');
  if (request.status !== 'Pending') throw new Error(`Approval request is already ${request.status}`);

  const workflow = request.workflowId;
  const currentStepConfig = workflow.steps.find(s => s.stepOrder === request.currentStep);
  if (!currentStepConfig) throw new Error('Current step configuration not found');

  // Segregation of Duties (SoD) Check
  // Requester cannot approve their own request if there's a matching rule or general self-approval restriction
  const isRequester = request.requestedBy.toString() === userId.toString();
  if (isRequester) {
    throw new Error('Segregation of Duties violation: Requester cannot approve their own request');
  }

  // Check if user already decided on THIS step
  const alreadyDecidedOnStep = request.decisions.some(
    d => d.stepOrder === request.currentStep && d.userId.toString() === userId.toString()
  );
  if (alreadyDecidedOnStep) {
    throw new Error('User has already recorded a decision for this step');
  }

  // Record decision
  request.decisions.push({
    userId,
    action,
    stepOrder: request.currentStep,
    reason,
    ipAddress,
    timestamp: new Date()
  });

  if (action === 'Reject') {
    request.status = 'Rejected';
  } else if (action === 'Approve') {
    // Count approvals for the current step
    const approvalsForStep = request.decisions.filter(
      d => d.stepOrder === request.currentStep && d.action === 'Approve'
    ).length;

    if (approvalsForStep >= currentStepConfig.minApprovers) {
      // Advance to next step or mark Approved
      const nextStepConfig = workflow.steps.find(s => s.stepOrder === request.currentStep + 1);
      if (nextStepConfig) {
        request.currentStep += 1;
      } else {
        request.status = 'Approved';
      }
    }
  }

  await request.save();
  return request;
};

/**
 * Get pending approvals assigned to a specific user/role
 */
const getMyPendingApprovals = async (userId, userRole) => {
  const workflows = await ApprovalWorkflow.find({ 'steps.requiredRole': userRole, isActive: true });
  const workflowIds = workflows.map(w => w._id);

  const pendingRequests = await ApprovalRequest.find({
    status: 'Pending',
    workflowId: { $in: workflowIds }
  }).populate('workflowId');

  const myPending = pendingRequests.filter(req => {
    const workflow = req.workflowId;
    const currentStepConfig = workflow.steps.find(s => s.stepOrder === req.currentStep);
    
    // Step requires this role
    if (!currentStepConfig || currentStepConfig.requiredRole !== userRole) return false;
    
    // Requester cannot approve their own (SoD)
    if (req.requestedBy.toString() === userId.toString()) return false;

    // User hasn't already decided on this step
    const alreadyDecided = req.decisions.some(
      d => d.stepOrder === req.currentStep && d.userId.toString() === userId.toString()
    );
    return !alreadyDecided;
  });

  return myPending;
};

/**
 * Get full approval decision history for an entity
 */
const getApprovalHistory = async (entityType, entityId) => {
  return await ApprovalRequest.find({ entityType, entityId }).sort({ createdAt: -1 });
};

module.exports = {
  submitForApproval,
  processDecision,
  getMyPendingApprovals,
  getApprovalHistory
};
