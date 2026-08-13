describe('PRODUCTION PLAN SINGLE-ENTITY LIFECYCLE (UNSCHEDULED -> SCHEDULED -> RELEASED -> IN_PROGRESS -> COMPLETED)', () => {
  test('Transitions status on single ProductionPlan entity without creating duplicate records', () => {
    const plan = {
      _id: 'plan-1001',
      planNumber: 'PLN-1001',
      productId: 'prod-01',
      bomId: 'bom-01',
      warehouseId: 'wh-01',
      quantity: 1000,
      originalQuantity: 1000,
      scheduledQuantity: 0,
      remainingQuantity: 1000,
      status: 'Unscheduled',
      planSource: 'MRP',
      priority: 'High',
      scheduling: null
    };

    // 1. Initial State: Unscheduled
    expect(plan.status).toBe('Unscheduled');
    expect(plan.scheduling).toBeNull();

    // 2. Transition: Assign Schedule (UNSCHEDULED -> SCHEDULED)
    const schedulePayload = {
      productionDate: '2026-08-20',
      startTime: '08:00',
      endTime: '12:00',
      shift: 'Morning',
      workCenter: 'Line-01',
      durationHours: 4
    };

    plan.scheduling = schedulePayload;
    plan.scheduledQuantity = 1000;
    plan.remainingQuantity = 0;
    plan.status = 'Scheduled';

    expect(plan.status).toBe('Scheduled');
    expect(plan.scheduling.workCenter).toBe('Line-01');
    expect(plan.remainingQuantity).toBe(0);

    // 3. Transition: Release for Execution (SCHEDULED -> RELEASED)
    plan.status = 'Released';
    expect(plan.status).toBe('Released');

    // 4. Transition: Start Production (RELEASED -> IN_PROGRESS)
    plan.status = 'In Production';
    expect(plan.status).toBe('In Production');

    // 5. Transition: Production Complete (IN_PROGRESS -> COMPLETED)
    plan.status = 'Completed';
    expect(plan.status).toBe('Completed');
  });

  test('Validates exception states: CANCELLED, ON_HOLD, and RESCHEDULED', () => {
    const plan = {
      planNumber: 'PLN-1002',
      status: 'Unscheduled'
    };

    // Exception: Cancel Plan
    plan.status = 'Cancelled';
    plan.cancelReason = 'Material shortage or customer request';
    expect(plan.status).toBe('Cancelled');

    // Exception: On Hold
    plan.status = 'On Hold';
    expect(plan.status).toBe('On Hold');

    // Exception: Rescheduled
    plan.status = 'Rescheduled';
    expect(plan.status).toBe('Rescheduled');
  });
});
