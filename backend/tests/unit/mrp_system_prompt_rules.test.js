describe('COMPLETE MRP + PRODUCTION + PROCUREMENT SYSTEM PROMPT RULES', () => {
  test('Rule 1: If shortage exists -> Block Production Plan creation', () => {
    const mrpDataWithShortage = {
      productId: '65f123456789012345678901',
      qty: 100,
      warehouseId: '65f123456789012345678902',
      hasShortage: true,
      canCreateProduction: false,
      materials: [
        { materialId: '65f123456789012345678903', requiredQty: 500, availableQty: 0, shortageQty: 500 }
      ]
    };

    expect(mrpDataWithShortage.hasShortage).toBe(true);
    expect(mrpDataWithShortage.canCreateProduction).toBe(false);

    // Business Logic Validation Function
    const canCreateProductionPlan = (mrpData) => {
      if (mrpData.hasShortage) {
        throw new Error('Material shortage. Cannot create plan.');
      }
      return true;
    };

    expect(() => canCreateProductionPlan(mrpDataWithShortage)).toThrow('Material shortage. Cannot create plan.');
  });

  test('Rule 2: Shortage -> ONLY procurement flow (No PR when no shortage)', () => {
    const mrpDataNoShortage = {
      productId: '65f123456789012345678901',
      qty: 50,
      warehouseId: '65f123456789012345678902',
      hasShortage: false,
      canCreateProduction: true,
      materials: [
        { materialId: '65f123456789012345678903', requiredQty: 100, availableQty: 200, shortageQty: 0 }
      ]
    };

    expect(mrpDataNoShortage.hasShortage).toBe(false);
    expect(mrpDataNoShortage.canCreateProduction).toBe(true);

    const validateProcurementRequest = (mrpData) => {
      if (!mrpData.hasShortage) {
        throw new Error('No shortage');
      }
      return true;
    };

    expect(() => validateProcurementRequest(mrpDataNoShortage)).toThrow('No shortage');
  });

  test('Rule 3: Plan Count & Split-Scheduling Logic (Unit Slots)', () => {
    const plan = {
      planNumber: 'PLAN-1001',
      quantity: 100,
      originalQuantity: 100,
      scheduledQuantity: 0,
      remainingQuantity: 100,
      availableUnits: 100,
      status: 'UNSCHEDULED'
    };

    // Execution Batch 1: 40 units scheduled
    plan.scheduledQuantity += 40;
    plan.remainingQuantity = Math.max(0, plan.originalQuantity - plan.scheduledQuantity);
    plan.availableUnits = plan.remainingQuantity;

    expect(plan.scheduledQuantity).toBe(40);
    expect(plan.availableUnits).toBe(60);

    // Execution Batch 2: 60 units scheduled (Reaches 100%)
    plan.scheduledQuantity += 60;
    plan.remainingQuantity = Math.max(0, plan.originalQuantity - plan.scheduledQuantity);
    plan.availableUnits = plan.remainingQuantity;
    plan.status = plan.availableUnits === 0 ? 'SCHEDULED' : 'PARTIALLY SCHEDULED';

    expect(plan.scheduledQuantity).toBe(100);
    expect(plan.availableUnits).toBe(0);
    expect(plan.status).toBe('SCHEDULED');
  });
});
