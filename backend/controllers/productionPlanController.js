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

// @desc    Schedule production plan (with partial quantity support)
// @route   POST /api/production-plans/:id/schedule
// @access  Private
exports.scheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  if (['Completed', 'Cancelled'].includes(plan.status)) {
    return res.status(400).json({ success: false, error: `Plan in status ${plan.status} cannot be scheduled` });
  }

  const scheduleQty = req.body.quantity || plan.quantity;

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

  const order = await ProductionOrder.create({
    prdNumber,
    planId: plan._id,
    bomId: plan.bomId,
    productId: plan.productId,
    sourceWarehouseId: plan.warehouseId,
    destinationWarehouseId: plan.warehouseId,
    targetQuantity: scheduleQty,
    batchNumber: plan.planNumber,
    status: 'Scheduled',
    components,
    expectedCost,
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

  plan.status = 'Scheduled';
  await plan.save();

  res.status(200).json({ success: true, data: plan, order });
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
