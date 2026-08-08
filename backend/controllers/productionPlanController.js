const mongoose = require('mongoose');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const Sequence = require('../models/Sequence');
const BOM = require('../models/BOM');
const asyncHandler = require('../middleware/asyncHandler');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');

// @desc    Get all production plans
// @route   GET /api/production-plans
// @access  Private
exports.getProductionPlans = asyncHandler(async (req, res, next) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.warehouseId) query.warehouseId = req.query.warehouseId;

  const plans = await ProductionPlan.find(query)
    .populate('productId', 'name code')
    .populate('bomId', 'name version')
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

// @desc    Create production plan
// @route   POST /api/production-plans
// @access  Private
exports.createProductionPlan = asyncHandler(async (req, res, next) => {
  req.body.createdBy = req.user.id;
  
  // Get Sequence
  let seqDoc = await Sequence.findById('productionPlan');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'productionPlan', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('productionPlan', { $inc: { seq: 1 } }, { new: true });
  }
  req.body.planNumber = `PLAN-${seqDoc.seq}`;

  const plan = await ProductionPlan.create(req.body);
  res.status(201).json({ success: true, data: plan });
});

// @desc    Schedule production plan (Convert to Production Order)
// @route   POST /api/production-plans/:id/schedule
// @access  Private
exports.scheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const session = await startSafeTransaction();
  
  try {
    const plan = await ProductionPlan.findById(req.params.id).session(session);
    if (!plan) {
      await abortSafeTransaction(session);
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    if (plan.status !== 'Pending') {
      await abortSafeTransaction(session);
      return res.status(400).json({ success: false, error: 'Only pending plans can be scheduled' });
    }

    // Validate BOM
    const bom = await BOM.findById(plan.bomId).populate('components.mpnId').session(session);
    if (!bom) {
      await abortSafeTransaction(session);
      return res.status(404).json({ success: false, error: 'BOM not found' });
    }

    // Generate Production Order Number
    let seqDoc = await Sequence.findById('productionOrder').session(session);
    if (!seqDoc) {
      seqDoc = await Sequence.create([{ _id: 'productionOrder', seq: 1000 }], { session });
      seqDoc = seqDoc[0];
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('productionOrder', { $inc: { seq: 1 } }, { new: true, session });
    }
    const prdNumber = `PRD-${seqDoc.seq}`;

    // Calculate Expected Cost
    let expectedCost = 0;
    const components = bom.components.map(comp => {
      const effectivePrice = comp.mpnId.latestPrice || 0; 
      const expectedQty = (comp.qty / bom.batchSize) * plan.quantity;
      const compCost = (expectedQty * effectivePrice) / (1 - (comp.lossPercent / 100));
      expectedCost += compCost;

      return {
        mpnId: comp.mpnId._id,
        expectedQuantity: expectedQty,
        lossPercent: comp.lossPercent,
        expectedCost: compCost
      };
    });

    const order = await ProductionOrder.create([{
      prdNumber,
      planId: plan._id,
      bomId: plan.bomId,
      productId: plan.productId,
      sourceWarehouseId: plan.warehouseId,
      destinationWarehouseId: plan.warehouseId,
      targetQuantity: plan.quantity,
      batchNumber: plan.planNumber,
      status: 'Scheduled', // Using 'Scheduled' instead of 'Draft' per new flow
      components,
      expectedCost,
      createdBy: req.user.id,
      ipAddress: req.ip,
    }], { session });

    plan.status = 'Scheduled';
    await plan.save({ session });

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: plan, order: order[0] });

  } catch (error) {
    await abortSafeTransaction(session);
    next(error);
  }
});

// @desc    Unschedule production plan
// @route   POST /api/production-plans/:id/unschedule
// @access  Private
exports.unscheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const session = await startSafeTransaction();
  
  try {
    const plan = await ProductionPlan.findById(req.params.id).session(session);
    if (!plan) {
      await abortSafeTransaction(session);
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    if (plan.status !== 'Scheduled') {
      await abortSafeTransaction(session);
      return res.status(400).json({ success: false, error: 'Only scheduled plans can be unscheduled' });
    }

    // Find the linked Production Order
    const order = await ProductionOrder.findOne({ planId: plan._id }).session(session);
    
    if (order) {
      // Allow cancellation if Draft, Pending Approval, Approved, or Scheduled
      const cancellableStatuses = ['Draft', 'Pending Approval', 'Approved', 'Scheduled'];
      
      if (!cancellableStatuses.includes(order.status)) {
        await abortSafeTransaction(session);
        return res.status(400).json({ 
          success: false, 
          error: `Production Order ${order.prdNumber} has already progressed to '${order.status}' and cannot be unscheduled safely without a formal cancellation workflow.` 
        });
      }

      order.status = 'Cancelled';
      await order.save({ session });
    }

    plan.status = 'Pending';
    await plan.save({ session });

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: plan });

  } catch (error) {
    await abortSafeTransaction(session);
    next(error);
  }
});
