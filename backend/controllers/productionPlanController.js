const mongoose = require('mongoose');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const Sequence = require('../models/Sequence');
const BOM = require('../models/BOM');
const asyncHandler = require('../middleware/asyncHandler');
const InventoryLedgerService = require('../services/inventoryLedgerService');

// @desc    Get all production plans with optional filtering
// @route   GET /api/production-plans
// @access  Private
exports.getProductionPlans = asyncHandler(async (req, res, next) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.warehouseId) query.warehouseId = req.query.warehouseId;

  const plans = await ProductionPlan.find(query)
    .populate('productId', 'name code unit type')
    .populate('bomId')
    .populate('warehouseId', 'name code')
    .populate('createdBy', 'username email')
    .sort('-createdAt');
    
  res.status(200).json({ success: true, count: plans.length, data: plans });
});

// @desc    Get single production plan
// @route   GET /api/production-plans/:id
// @access  Private
exports.getProductionPlanById = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id)
    .populate('productId')
    .populate('bomId')
    .populate('warehouseId')
    .populate('createdBy');

  if (!plan) return res.status(404).json({ success: false, error: 'Production plan not found' });
  res.status(200).json({ success: true, data: plan });
});

// @desc    Create manual production plan
// @route   POST /api/production-plans
// @access  Private
exports.createProductionPlan = asyncHandler(async (req, res, next) => {
  req.body.createdBy = req.user ? req.user.id : null;
  
  let seqDoc = await Sequence.findById('productionPlan');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'productionPlan', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('productionPlan', { $inc: { seq: 1 } }, { new: true });
  }
  req.body.planNumber = `PLAN-${seqDoc.seq}`;
  if (!req.body.status) req.body.status = 'Unscheduled';

  const plan = await ProductionPlan.create(req.body);
  res.status(201).json({ success: true, data: plan });
});

// @desc    Schedule production plan (with partial quantity split-scheduling support)
// @route   POST /api/production-plans/:id/schedule
// @access  Private
exports.scheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  if (['Completed', 'Cancelled'].includes(plan.status)) {
    return res.status(400).json({ success: false, error: `Plan in status ${plan.status} cannot be scheduled` });
  }

  // Ensure quantity bounds
  const currentOriginal = plan.originalQuantity || plan.quantity;
  const currentScheduled = plan.scheduledQuantity || 0;
  const currentRemaining = plan.remainingQuantity !== undefined ? plan.remainingQuantity : (currentOriginal - currentScheduled);

  if (currentRemaining <= 0) {
    return res.status(400).json({ success: false, error: `Plan ${plan.planNumber} has already been 100% scheduled (${currentScheduled}/${currentOriginal} units)` });
  }

  const scheduleQty = Math.min(req.body.quantity || currentRemaining, currentRemaining);

  const bom = await BOM.findById(plan.bomId).populate('components.materialId').populate('components.mpnId');
  if (!bom) return res.status(404).json({ success: false, error: 'Associated BOM not found' });

  let seqDoc = await Sequence.findById('productionOrder');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'productionOrder', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('productionOrder', { $inc: { seq: 1 } }, { new: true });
  }
  const prdNumber = `PRD-${seqDoc.seq}`;

  let expectedCost = 0;
  const components = (bom.components || []).map(comp => {
    const effectivePrice = comp.mpnId ? (comp.mpnId.latestPrice || 0) : 0; 
    const expectedQty = (comp.quantity || comp.qty || 1) * scheduleQty;
    const compCost = expectedQty * effectivePrice;
    expectedCost += compCost;

    return {
      materialId: comp.materialId ? comp.materialId._id : null,
      mpnId: comp.mpnId ? comp.mpnId._id : null,
      expectedQuantity: expectedQty,
      lossPercent: comp.lossPercentage || comp.lossPercent || 0,
      expectedCost: compCost
    };
  });

  // Assign dates & work center if provided
  if (req.body.startDate) plan.scheduledStartDate = new Date(req.body.startDate);
  if (req.body.endDate) plan.scheduledEndDate = new Date(req.body.endDate);
  if (req.body.workCenter) plan.workCenter = req.body.workCenter;

  plan.scheduling = {
    direction: req.body.direction || 'Forward',
    schedulingDate: req.body.schedulingDate ? new Date(req.body.schedulingDate) : (req.body.startDate ? new Date(req.body.startDate) : new Date()),
    startTime: req.body.startTime || '09:00',
    durationHours: req.body.durationHours ? parseFloat(req.body.durationHours) : 6,
    plannedStartDateTime: req.body.startDate ? new Date(req.body.startDate) : new Date(),
    plannedEndDateTime: req.body.endDate ? new Date(req.body.endDate) : new Date(Date.now() + 86400000 * 3),
    resourceGroup: req.body.resourceGroup || 'Assembly & Production',
    selectedResource: req.body.workCenter || req.body.selectedResource || 'Main Assembly Line 1',
    capacityRequired: req.body.capacityRequired ? parseFloat(req.body.capacityRequired) : 6,
    capacityAvailable: req.body.capacityAvailable ? parseFloat(req.body.capacityAvailable) : 8,
    materialCheckStatus: req.body.materialCheckStatus || 'Ready',
    capacityCheckStatus: req.body.capacityCheckStatus || 'Sufficient',
    operations: req.body.operations || [
      { seq: 10, name: 'Mixing', resource: 'Mixer-01', setupMins: 30, runMins: 120, startTime: '09:00', endTime: '11:30' },
      { seq: 20, name: 'Cooking / Processing', resource: 'Cooker-01', setupMins: 20, runMins: 180, startTime: '11:30', endTime: '14:50' },
      { seq: 30, name: 'Packing & Quality Check', resource: 'Pack-01', setupMins: 15, runMins: 60, startTime: '14:50', endTime: '16:05' }
    ]
  };

  const order = await ProductionOrder.create({
    prdNumber,
    planId: plan._id,
    bomId: plan.bomId,
    productId: plan.productId,
    siteId: plan.siteId,
    sourceWarehouseId: plan.warehouseId,
    destinationWarehouseId: plan.warehouseId,
    scheduledStartDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
    scheduledEndDate: req.body.endDate ? new Date(req.body.endDate) : new Date(Date.now() + 86400000 * 3),
    workCenter: req.body.workCenter || 'Main Assembly Line 1',
    targetQuantity: scheduleQty,
    completedQuantity: 0,
    rejectedQuantity: 0,
    batchNumber: plan.planNumber,
    status: 'Scheduled',
    priority: plan.priority || 'Medium',
    expectedCost,
    actualCost: 0,
    components,
    history: [{
      status: 'Scheduled',
      changedBy: req.user ? req.user.id : null,
      notes: `Production Order created automatically via scheduling Plan ${plan.planNumber}`
    }],
    createdBy: req.user ? req.user.id : null,
    ipAddress: req.ip,
  });

  // Soft-reserve material components in warehouse
  for (const comp of bom.components || []) {
    const matId = comp.materialId ? comp.materialId._id : comp.materialId;
    if (!matId) continue;
    const reqQty = (comp.quantity || comp.qty || 1) * scheduleQty;
    try {
      await InventoryLedgerService.recordTransaction({
        materialId: matId,
        warehouseId: plan.warehouseId,
        quantity: reqQty,
        type: 'Reservation',
        referenceId: plan.planNumber,
        sourceDocType: 'ProductionPlan',
        sourceDocId: plan._id.toString(),
        reason: `Soft reservation for scheduled Plan ${plan.planNumber}`,
        userId: req.user ? req.user.id : null,
      });
    } catch (err) {
      console.warn(`[Schedule Plan] Material reservation warning: ${err.message}`);
    }
  }

  // Update split-scheduling counters
  plan.scheduledQuantity = currentScheduled + scheduleQty;
  plan.remainingQuantity = Math.max(0, currentOriginal - plan.scheduledQuantity);

  if (plan.remainingQuantity > 0) {
    plan.status = 'Partially Scheduled';
  } else {
    plan.status = 'Scheduled';
  }
  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    order,
    message: `✓ Scheduled ${scheduleQty} units for Plan ${plan.planNumber}. ${plan.remainingQuantity} units remaining to schedule.`
  });
});

// @desc    Copy / Duplicate production plan
// @route   POST /api/production-plans/:id/copy
// @access  Private
exports.copyProductionPlan = asyncHandler(async (req, res, next) => {
  const sourcePlan = await ProductionPlan.findById(req.params.id);
  if (!sourcePlan) return res.status(404).json({ success: false, error: 'Source plan not found' });

  let seqDoc = await Sequence.findById('productionPlan');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'productionPlan', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('productionPlan', { $inc: { seq: 1 } }, { new: true });
  }
  const newPlanNumber = `PLAN-${seqDoc.seq}`;

  const targetQuantity = req.body.quantity || sourcePlan.originalQuantity || sourcePlan.quantity;

  const newPlan = await ProductionPlan.create({
    planNumber: newPlanNumber,
    productId: sourcePlan.productId,
    bomId: sourcePlan.bomId,
    siteId: sourcePlan.siteId,
    warehouseId: sourcePlan.warehouseId,
    quantity: targetQuantity,
    originalQuantity: targetQuantity,
    scheduledQuantity: 0,
    remainingQuantity: targetQuantity,
    requiredDate: req.body.requiredDate || new Date(Date.now() + 86400000 * 7),
    status: 'Unscheduled',
    planSource: 'Manual',
    priority: sourcePlan.priority || 'Medium',
    reason: `Duplicated from ${sourcePlan.planNumber}`,
    notes: sourcePlan.notes ? `Copy of ${sourcePlan.planNumber}. ${sourcePlan.notes}` : `Copy of ${sourcePlan.planNumber}`,
    copiedFromPlanId: sourcePlan._id,
    createdBy: req.user ? req.user.id : null,
  });

  res.status(201).json({
    success: true,
    data: newPlan,
    message: `✓ Plan ${sourcePlan.planNumber} copied successfully as ${newPlan.planNumber}`
  });
});

// @desc    Release production plan (Trigger soft material reservation)
// @route   POST /api/production-plans/:id/release
// @access  Private
exports.releaseProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const bom = await BOM.findById(plan.bomId).populate('components.materialId');
  if (!bom) return res.status(404).json({ success: false, error: 'BOM not found' });

  // Soft reserve required components from inventory
  const reservationResults = [];
  for (const comp of bom.components) {
    if (!comp.materialId) continue;
    const reqQty = (comp.quantity || comp.qty || 1) * plan.quantity;

    try {
      const resResult = await InventoryLedgerService.recordTransaction({
        materialId: comp.materialId._id,
        warehouseId: plan.warehouseId,
        quantity: reqQty,
        type: 'Reservation',
        referenceId: plan.planNumber,
        sourceDocType: 'ProductionPlan',
        sourceDocId: plan._id.toString(),
        reason: `Material soft reservation for Plan ${plan.planNumber}`,
        userId: req.user ? req.user.id : null,
      });
      reservationResults.push(resResult);
    } catch (err) {
      console.warn(`[Plan Release] Material reservation warning for ${comp.materialId.name}: ${err.message}`);
    }
  }

  plan.status = 'Released';
  await plan.save();

  res.status(200).json({ success: true, message: `Plan ${plan.planNumber} released and materials soft-reserved`, plan, reservationResults });
});

// @desc    Unschedule production plan & release reservations
// @route   POST /api/production-plans/:id/unschedule
// @access  Private
exports.unscheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  if (['Unscheduled', 'Pending', 'PLANNED'].includes(plan.status)) {
    return res.status(200).json({
      success: true,
      message: 'PLAN_ALREADY_UNSCHEDULED',
      data: plan
    });
  }

  const orders = await ProductionOrder.find({ planId: plan._id });
  for (const order of orders) {
    if (['In Production', 'Completed'].includes(order.status)) {
      return res.status(400).json({ success: false, error: `Order ${order.prdNumber} is already in execution (${order.status}) and cannot be unscheduled` });
    }
    order.status = 'Cancelled';
    await order.save();
  }

  // Release any soft-reserved components
  const bom = await BOM.findById(plan.bomId).populate('components.materialId');
  if (bom) {
    for (const comp of bom.components) {
      if (!comp.materialId) continue;
      const reqQty = (comp.quantity || comp.qty || 1) * plan.quantity;
      try {
        await InventoryLedgerService.recordTransaction({
          materialId: comp.materialId._id,
          warehouseId: plan.warehouseId,
          quantity: reqQty,
          type: 'Release',
          referenceId: plan.planNumber,
          sourceDocType: 'ProductionPlan',
          sourceDocId: plan._id.toString(),
          reason: `Material reservation release for unscheduled Plan ${plan.planNumber}`,
          userId: req.user ? req.user.id : null,
        });
      } catch (err) {
        console.warn(`[Unschedule] Release reservation warning: ${err.message}`);
      }
    }
  }

  plan.status = 'Unscheduled';
  await plan.save();

  res.status(200).json({ success: true, data: plan });
});

// @desc    Cancel production plan
// @route   POST /api/production-plans/:id/cancel
// @access  Private
exports.cancelProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  if (plan.status === 'Completed') {
    return res.status(400).json({ success: false, error: 'Completed plans cannot be cancelled' });
  }

  // Cancel any linked non-started production orders
  const orders = await ProductionOrder.find({ planId: plan._id });
  for (const order of orders) {
    if (['In Production', 'Completed'].includes(order.status)) {
      return res.status(400).json({ success: false, error: `Order ${order.prdNumber} is already in production/completed and plan cannot be cancelled` });
    }
    order.status = 'Cancelled';
    await order.save();
  }

  // Release reservation if plan was Scheduled
  if (plan.status === 'Scheduled' || plan.status === 'Released') {
    const bom = await BOM.findById(plan.bomId).populate('components.materialId');
    if (bom) {
      for (const comp of bom.components) {
        if (!comp.materialId) continue;
        const reqQty = (comp.quantity || comp.qty || 1) * plan.quantity;
        try {
          await InventoryLedgerService.recordTransaction({
            materialId: comp.materialId._id,
            warehouseId: plan.warehouseId,
            quantity: reqQty,
            type: 'RELEASE',
            referenceId: plan.planNumber,
            sourceDocType: 'ProductionPlan',
            sourceDocId: plan._id.toString(),
            reason: `Reservation release for cancelled Plan ${plan.planNumber}`,
            userId: req.user ? req.user.id : null,
          });
        } catch (err) {
          console.warn(`[Cancel Plan] Reservation release notice: ${err.message}`);
        }
      }
    }
  }

  plan.status = 'Cancelled';
  plan.cancelReason = req.body.reason || 'Cancelled by planner';
  plan.cancelledBy = req.user ? req.user.id : null;
  plan.cancelledAt = Date.now();
  await plan.save();

  res.status(200).json({ success: true, message: `Plan ${plan.planNumber} cancelled`, data: plan });
});
