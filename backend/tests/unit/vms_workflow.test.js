const mongoose = require('mongoose');
const workflowEngineService = require('../../services/workflowEngineService');

describe('VMS Workflow Engine Unit Tests', () => {
  beforeAll(async () => {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test('executeStep correctly evaluates Condition step', async () => {
    const step = {
      stepOrder: 1,
      name: 'Check VIP',
      type: 'Condition',
      config: { field: 'purpose', operator: 'equals', value: 'VIP' }
    };
    const payload = { purpose: 'VIP' };
    const res = await workflowEngineService.executeStep(step, payload, {});
    expect(res.status).toBe('Success');
    expect(res.result.conditionMet).toBe(true);
  });

  test('executeWorkflow returns executions for active workflows', async () => {
    const executions = await workflowEngineService.executeWorkflow('appointment.created', {
      appointmentId: new mongoose.Types.ObjectId().toString(),
      visitorEmail: 'visitor@example.com',
      purpose: 'VIP',
      status: 'Approved'
    });
    expect(Array.isArray(executions)).toBe(true);
  });
});
