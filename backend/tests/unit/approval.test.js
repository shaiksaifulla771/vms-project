const mongoose = require('mongoose');
const ApprovalWorkflow = require('../../models/ApprovalWorkflow');
const ApprovalRequest = require('../../models/ApprovalRequest');
const approvalEngine = require('../../services/approvalEngine');

describe('Session 2 — Approval Engine & SoD Unit Tests', () => {
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_approval';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
  });

  afterAll(async () => {
    await ApprovalWorkflow.deleteMany({});
    await ApprovalRequest.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await ApprovalWorkflow.deleteMany({});
    await ApprovalRequest.deleteMany({});
  });

  test('1. Should submit an entity for approval matching active workflow', async () => {
    const workflow = await ApprovalWorkflow.create({
      entityType: 'PurchaseOrder',
      steps: [
        { stepOrder: 1, requiredRole: 'Inventory Manager', minApprovers: 1, description: 'Manager Signoff' }
      ],
      isActive: true
    });

    const requesterId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();

    const request = await approvalEngine.submitForApproval('PurchaseOrder', entityId, requesterId);

    expect(request).toBeDefined();
    expect(request.status).toBe('Pending');
    expect(request.currentStep).toBe(1);
    expect(request.requestedBy.toString()).toBe(requesterId.toString());
  });

  test('2. Should BLOCK self-approval attempt by Requester (Segregation of Duties enforcement)', async () => {
    await ApprovalWorkflow.create({
      entityType: 'PurchaseOrder',
      steps: [
        { stepOrder: 1, requiredRole: 'ProcurementManager', minApprovers: 1 }
      ],
      isActive: true
    });

    const requesterId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();

    const request = await approvalEngine.submitForApproval('PurchaseOrder', entityId, requesterId);

    // Requester attempts to approve their own request -> MUST be blocked by SoD
    await expect(
      approvalEngine.processDecision(request._id, requesterId, 'Approve', 'Self approval attempt', '127.0.0.1')
    ).rejects.toThrow('Segregation of Duties violation: Requester cannot approve their own request');
  });

  test('3. Should allow an independent authorized user to approve and complete the workflow', async () => {
    await ApprovalWorkflow.create({
      entityType: 'PurchaseOrder',
      steps: [
        { stepOrder: 1, requiredRole: 'ProcurementManager', minApprovers: 1 }
      ],
      isActive: true
    });

    const requesterId = new mongoose.Types.ObjectId();
    const approverId = new mongoose.Types.ObjectId(); // Independent user
    const entityId = new mongoose.Types.ObjectId();

    const request = await approvalEngine.submitForApproval('PurchaseOrder', entityId, requesterId);

    const updatedRequest = await approvalEngine.processDecision(
      request._id,
      approverId,
      'Approve',
      'PO details verified',
      '127.0.0.1'
    );

    expect(updatedRequest.status).toBe('Approved');
    expect(updatedRequest.decisions.length).toBe(1);
    expect(updatedRequest.decisions[0].userId.toString()).toBe(approverId.toString());
    expect(updatedRequest.decisions[0].action).toBe('Approve');
  });

  test('4. Should handle rejection correctly', async () => {
    await ApprovalWorkflow.create({
      entityType: 'ProductionOrder',
      steps: [
        { stepOrder: 1, requiredRole: 'Production Manager', minApprovers: 1 }
      ],
      isActive: true
    });

    const requesterId = new mongoose.Types.ObjectId();
    const approverId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();

    const request = await approvalEngine.submitForApproval('ProductionOrder', entityId, requesterId);

    const updatedRequest = await approvalEngine.processDecision(
      request._id,
      approverId,
      'Reject',
      'Insufficient capacity',
      '127.0.0.1'
    );

    expect(updatedRequest.status).toBe('Rejected');
    expect(updatedRequest.decisions[0].action).toBe('Reject');
  });

  test('5. Should advance through multi-step workflows sequentially', async () => {
    await ApprovalWorkflow.create({
      entityType: 'VendorMaster',
      steps: [
        { stepOrder: 1, requiredRole: 'ProcurementManager', minApprovers: 1, description: 'Step 1: Procurement' },
        { stepOrder: 2, requiredRole: 'Finance', minApprovers: 1, description: 'Step 2: Finance' }
      ],
      isActive: true
    });

    const requesterId = new mongoose.Types.ObjectId();
    const step1ApproverId = new mongoose.Types.ObjectId();
    const step2ApproverId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();

    const request = await approvalEngine.submitForApproval('VendorMaster', entityId, requesterId);
    expect(request.currentStep).toBe(1);

    // Step 1 Approval
    const afterStep1 = await approvalEngine.processDecision(
      request._id,
      step1ApproverId,
      'Approve',
      'Procurement approved',
      '127.0.0.1'
    );

    expect(afterStep1.currentStep).toBe(2);
    expect(afterStep1.status).toBe('Pending');

    // Step 2 Approval
    const afterStep2 = await approvalEngine.processDecision(
      request._id,
      step2ApproverId,
      'Approve',
      'Finance approved',
      '127.0.0.1'
    );

    expect(afterStep2.status).toBe('Approved');
    expect(afterStep2.decisions.length).toBe(2);
  });
});
