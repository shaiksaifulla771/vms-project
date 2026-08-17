const mongoose = require('mongoose');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const Sequence = require('../models/Sequence');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const asyncHandler = require('../middleware/asyncHandler');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const MRPEngineService = require('../services/mrpEngineService');

// Helper: Generate next sequential number
async function nextSeqNumber(key, prefix) {
  let seqDoc = await Sequence.findById(key);
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: key, seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true });
  }
  return `${prefix}-${seqDoc.seq}`;
}

// @desc    Get all production plans with filters and pagination
// @route   GET /api/production-plans
// @access  Private
exports.getProductionPlans = asyncHandler(async (req, res, next) => {
  const query = {};
  const andConditions = [];
  
  if (req.query.status && req.query.status !== 'ALL') {
    const statusVal = req.query.status;
    query.status = { $regex: new RegExp(`^${statusVal}$`, 'i') };
  }

  if (req.query.siteId && req.query.siteId !== 'ALL' && req.query.siteId !== '') {
    const Warehouse = require('../models/Warehouse');
    const siteWhs = await Warehouse.find({ siteId: req.query.siteId }).select('_id');
    const whIds = siteWhs.map(w => w._id);
    andConditions.push({
      $or: [
        { siteId: req.query.siteId },
        { warehouseId: { $in: whIds } }
      ]
    });
  }

  if (req.query.warehouseId && req.query.warehouseId !== 'ALL' && req.query.warehouseId !== 'all' && req.query.warehouseId !== '') {
    query.warehouseId = req.query.warehouseId;
  }

  if (req.query.product || req.query.productId) {
    const prodId = req.query.product || req.query.productId;
    andConditions.push({
      $or: [
        { productId: prodId },
        { product: prodId }
      ]
    });
  }
  if (req.query.priority) {
    query.priority = { $regex: new RegExp(`^${req.query.priority}$`, 'i') };
  }
  if (req.query.source || req.query.planSource) {
    const src = req.query.source || req.query.planSource;
    andConditions.push({
      $or: [
        { source: { $regex: new RegExp(`^${src}$`, 'i') } },
        { planSource: { $regex: new RegExp(`^${src}$`, 'i') } }
      ]
    });
  }
  if (req.query.startDate && req.query.endDate) {
    query.requiredDate = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    andConditions.push({
      $or: [
        { planNumber: searchRegex },
        { planName: searchRegex },
        { productCode: searchRegex },
        { productName: searchRegex },
        { notes: searchRegex }
      ]
    });
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;

  const [plans, total] = await Promise.all([
    ProductionPlan.find(query)
      .populate('productId', 'name code unit type')
      .populate('product', 'name code unit type')
      .populate('bomId')
      .populate('warehouseId', 'name code')
      .populate('ingredients.material', 'name code unit')
      .populate('createdBy', 'username email')
      .populate('approvedBy', 'username email')
      .populate('releasedBy', 'username email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    ProductionPlan.countDocuments(query)
  ]);
    
  res.status(200).json({ success: true, count: plans.length, total, page, limit, data: plans });
});

// @desc    Get single production plan
// @route   GET /api/production-plans/:id
// @access  Private
exports.getProductionPlanById = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id)
    .populate('productId')
    .populate('product')
    .populate('bomId')
    .populate('bom')
    .populate('warehouseId')
    .populate('ingredients.material')
    .populate('createdBy', 'username email')
    .populate('approvedBy', 'username email')
    .populate('releasedBy', 'username email')
    .populate('completedBy', 'username email')
    .populate('releasedProductionOrderId');

  if (!plan) return res.status(404).json({ success: false, error: 'Production plan not found' });
  res.status(200).json({ success: true, data: plan });
});

// @desc    Create manual production plan
// @route   POST /api/production-plans/manual (and POST /api/production-plans)
// @access  Private
exports.createManualPlan = asyncHandler(async (req, res, next) => {
  const {
    planName,
    productId,
    bomId,
    totalPlans,
    quantity,
    requiredDate,
    requiredByDate,
    priority = 'MEDIUM',
    siteId,
    warehouseId,
    ingredients,
    notes,
    remarks
  } = req.body;

  const targetProductId = productId || req.body.product;
  const targetPlansCount = Math.max(1, parseInt(totalPlans || quantity || req.body.targetQty || 1, 10));
  const targetWarehouseId = warehouseId || req.body.warehouse;

  if (!targetProductId || !targetWarehouseId) {
    return res.status(400).json({ success: false, error: 'Product and Warehouse are required' });
  }

  const product = await Material.findById(targetProductId);
  if (!product) return res.status(404).json({ success: false, error: 'Product material not found' });

  let activeBomId = bomId || req.body.bom;
  let activeBom = null;
  if (activeBomId) {
    activeBom = await BOM.findById(activeBomId).populate('components.materialId').populate('components.mpnId');
  } else if (!ingredients || ingredients.length === 0) {
    activeBom = await BOM.findOne({ productId: targetProductId, status: 'Active' })
      .populate('components.materialId')
      .populate('components.mpnId') ||
      await BOM.findOne({ productId: targetProductId, status: { $ne: 'Deleted' } })
      .populate('components.materialId')
      .populate('components.mpnId');
  }

  let finalIngredients = [];
  let materialStatus = { status: 'READY', shortages: [], components: [] };

  if (activeBom && (!ingredients || ingredients.length === 0)) {
    const batchSize = activeBom.batchSize || 1;
    finalIngredients = (activeBom.components || []).map(comp => {
      const compMat = comp.materialId || (comp.mpnId && comp.mpnId.materialId);
      const compQty = comp.quantity || comp.qty || 1;
      const lossPct = comp.lossPercentage || comp.lossPercent || 0;
      const quantityPerPlan = compQty / batchSize;
      const totalQuantity = (targetPlansCount * quantityPerPlan) * (1 + lossPct / 100);

      return {
        material: compMat?._id || compMat,
        materialId: compMat?._id || compMat,
        materialCode: compMat?.code || '',
        materialName: compMat?.name || '',
        quantityPerPlan: Math.round(quantityPerPlan * 10000) / 10000,
        totalQuantity: Math.round(totalQuantity * 10000) / 10000,
        uom: compMat?.unit || comp.uom || 'pcs',
        warehouse: targetWarehouseId,
        warehouseId: targetWarehouseId,
        lossPercentage: lossPct,
      };
    });
    materialStatus = await MRPEngineService.checkMaterialAvailability(activeBom._id, targetPlansCount, targetWarehouseId);
  } else if (Array.isArray(ingredients) && ingredients.length > 0) {
    // Custom ingredient list
    for (const ing of ingredients) {
      const matId = ing.materialId || ing.material;
      const matDoc = await Material.findById(matId);
      if (!matDoc) continue;
      const qtyPerPlan = Number(ing.quantityPerPlan || ing.qty || 1);
      const lossPct = Number(ing.lossPercentage || 0);
      const totalQuantity = (targetPlansCount * qtyPerPlan) * (1 + lossPct / 100);

      finalIngredients.push({
        material: matDoc._id,
        materialId: matDoc._id,
        materialCode: matDoc.code,
        materialName: matDoc.name,
        quantityPerPlan: Math.round(qtyPerPlan * 10000) / 10000,
        totalQuantity: Math.round(totalQuantity * 10000) / 10000,
        uom: ing.uom || matDoc.unit || 'pcs',
        warehouse: ing.warehouseId || ing.warehouse || targetWarehouseId,
        warehouseId: ing.warehouseId || ing.warehouse || targetWarehouseId,
        lossPercentage: lossPct,
      });
    }

    // Check stock for manual ingredients
    const matIds = finalIngredients.map(i => i.material);
    const invItems = await InventoryItem.find({ materialId: { $in: matIds }, warehouseId: targetWarehouseId });
    const stockMap = {};
    for (const item of invItems) {
      stockMap[item.materialId.toString()] = Math.max(0, (item.onHand || 0) - (item.reserved || 0));
    }
    const shortages = [];
    let hasShortage = false;
    let hasPartial = false;
    for (const ing of finalIngredients) {
      const avail = stockMap[ing.material.toString()] || 0;
      const shortageQty = Math.max(0, ing.totalQuantity - avail);
      if (shortageQty > 0) {
        hasShortage = true;
        if (avail > 0) hasPartial = true;
        shortages.push({
          material: ing.material,
          materialId: ing.material,
          materialCode: ing.materialCode,
          materialName: ing.materialName,
          requiredQty: ing.totalQuantity,
          availableQty: avail,
          shortageQty,
          unit: ing.uom,
          warehouseId: targetWarehouseId,
        });
      }
    }
    materialStatus = {
      status: hasShortage ? (hasPartial ? 'PARTIAL' : 'SHORTAGE') : 'READY',
      shortages,
      components: finalIngredients.map(i => ({
        materialId: i.material,
        materialCode: i.materialCode,
        materialName: i.materialName,
        requiredQty: i.totalQuantity,
        availableQty: stockMap[i.material.toString()] || 0,
        shortageQty: Math.max(0, i.totalQuantity - (stockMap[i.material.toString()] || 0)),
        unit: i.uom,
      })),
      checkedAt: new Date(),
    };
  } else {
    return res.status(400).json({ success: false, error: 'Either an active BOM or an ingredients array must be provided.' });
  }

  const targetDate = requiredByDate || requiredDate || new Date(Date.now() + 7 * 86400000);
  const planNumber = await nextSeqNumber('productionPlan', 'PLAN');

  const plan = await ProductionPlan.create({
    planNumber,
    planName: planName || `${product.name} Production`,
    productId: product._id,
    product: product._id,
    productCode: product.code,
    productName: product.name,
    bomId: activeBom ? activeBom._id : null,
    bom: activeBom ? activeBom._id : null,
    bomVersion: activeBom ? String(activeBom.version || 1) : '1',
    siteId: siteId || null,
    warehouseId: targetWarehouseId,
    totalPlans: targetPlansCount,
    availablePlans: targetPlansCount,
    reservedPlans: 0,
    releasedPlans: 0,
    completedPlans: 0,
    cancelledPlans: 0,
    ingredients: finalIngredients,
    quantity: targetPlansCount,
    originalQuantity: targetPlansCount,
    remainingQuantity: targetPlansCount,
    requiredDate: targetDate,
    requiredByDate: targetDate,
    status: 'UNSCHEDULED',
    planSource: 'MANUAL',
    source: 'MANUAL',
    priority: priority.toUpperCase(),
    materialStatus,
    remarks: remarks || notes || '',
    notes: notes || remarks || '',
    createdBy: req.user ? req.user.id : null,
    auditHistory: [
      {
        action: 'CREATE_MANUAL_PLAN',
        user: req.user ? req.user.id : null,
        timestamp: new Date(),
        details: `Manual plan ${planNumber} (${planName || product.name}) created with ${targetPlansCount} total plans and ${finalIngredients.length} ingredients`,
      }
    ]
  });

  res.status(201).json({
    success: true,
    data: plan,
    materialStatus,
    message: `Plan ${plan.planNumber} created successfully in UNSCHEDULED status with ${targetPlansCount} available plans.`
  });
});

exports.createProductionPlan = exports.createManualPlan;

// @desc    Strict MRP production plan creation (for backwards compatibility)
// @route   POST /api/production-plans/create-strict
// @access  Private
exports.createProductionPlanStrict = asyncHandler(async (req, res, next) => {
  return exports.createManualPlan(req, res, next);
});

// @desc    Schedule an UNSCHEDULED production plan (validating capacity and materials)
// @route   POST /api/production-plans/:id/schedule
// @access  Private
exports.scheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const normalizedStatus = (plan.status || '').toUpperCase();
  if (normalizedStatus === 'RELEASED' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'CANCELLED') {
    return res.status(400).json({ success: false, error: `Plan in status ${plan.status} cannot be scheduled` });
  }

  const {
    productionDate,
    startTime = '09:00',
    endTime = '17:00',
    shiftId,
    lineId,
    machineId,
    warehouseId,
    estimatedDuration = 480,
  } = req.body;

  const schedDate = productionDate ? new Date(productionDate) : (req.body.startDate ? new Date(req.body.startDate) : new Date());
  const targetWarehouseId = warehouseId || plan.warehouseId;

  // 1. Re-evaluate material availability for the target warehouse
  const matCheck = await MRPEngineService.checkMaterialAvailability(plan.bomId, plan.quantity, targetWarehouseId);

  // 2. Evaluate line & machine capacity overlap
  const selectedLine = lineId || req.body.workCenter || plan.workCenter || 'Main Assembly Line 1';
  const conflictOrder = await ProductionOrder.findOne({
    workCenter: selectedLine,
    status: { $in: ['Scheduled', 'SCHEDULED', 'Released', 'RELEASED', 'In Production', 'IN_PROGRESS'] },
    scheduledStartDate: { $lte: new Date(schedDate.getTime() + estimatedDuration * 60000) },
    scheduledEndDate: { $gte: schedDate },
    planId: { $ne: plan._id }
  });

  const capacityStatus = conflictOrder ? 'Overcapacity' : 'Sufficient';

  plan.schedule = {
    productionDate: schedDate,
    startTime,
    endTime,
    shiftId: shiftId || null,
    lineId: lineId || selectedLine,
    machineId: machineId || null,
    warehouseId: targetWarehouseId,
    estimatedDuration,
    capacityCheckStatus: capacityStatus,
    materialCheckStatus: matCheck.status,
  };

  plan.materialStatus = matCheck;
  plan.status = 'SCHEDULED';
  plan.scheduledStartDate = schedDate;
  plan.scheduledEndDate = new Date(schedDate.getTime() + estimatedDuration * 60000);
  plan.workCenter = selectedLine;
  if (req.body.scheduling) {
    plan.scheduling = req.body.scheduling;
  }
  plan.updatedBy = req.user ? req.user.id : null;

  plan.auditHistory.push({
    action: 'SCHEDULE_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan scheduled for ${schedDate.toISOString().split('T')[0]} on ${selectedLine}. Material: ${matCheck.status}, Capacity: ${capacityStatus}`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.planNumber} successfully scheduled.`
  });
});

// @desc    Reschedule a SCHEDULED plan
// @route   PUT /api/production-plans/:id/reschedule
// @access  Private
exports.rescheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const normalizedStatus = (plan.status || '').toUpperCase();
  if (normalizedStatus !== 'SCHEDULED' && normalizedStatus !== 'UNSCHEDULED') {
    return res.status(400).json({ success: false, error: `Only SCHEDULED or UNSCHEDULED plans can be rescheduled (Current: ${plan.status})` });
  }

  const {
    productionDate,
    startTime = '09:00',
    endTime = '17:00',
    shiftId,
    lineId,
    machineId,
    warehouseId,
    estimatedDuration = 480,
    reason,
  } = req.body;

  const schedDate = productionDate ? new Date(productionDate) : (req.body.startDate ? new Date(req.body.startDate) : plan.schedule?.productionDate || new Date());
  const selectedLine = lineId || req.body.workCenter || plan.workCenter || 'Main Assembly Line 1';

  plan.schedule = {
    ...plan.schedule,
    productionDate: schedDate,
    startTime,
    endTime,
    shiftId: shiftId || plan.schedule?.shiftId,
    lineId: selectedLine,
    machineId: machineId || plan.schedule?.machineId,
    warehouseId: warehouseId || plan.warehouseId,
    estimatedDuration,
  };

  plan.scheduledStartDate = schedDate;
  plan.scheduledEndDate = new Date(schedDate.getTime() + estimatedDuration * 60000);
  plan.workCenter = selectedLine;
  plan.status = 'SCHEDULED';
  plan.updatedBy = req.user ? req.user.id : null;

  plan.auditHistory.push({
    action: 'RESCHEDULE_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan rescheduled to ${schedDate.toISOString().split('T')[0]}. Reason: ${reason || 'Planner update'}`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.planNumber} rescheduled successfully.`
  });
});

// @desc    Run live material availability check
// @route   POST /api/production-plans/:id/material-check
// @access  Private
exports.materialCheckProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const warehouseId = req.body.warehouseId || plan.warehouseId;
  const siteId = req.body.siteId || plan.siteId;
  const options = {
    strictWarehouse: req.body.strictWarehouse === true
  };

  const matCheck = await MRPEngineService.checkMaterialAvailability(
    plan.bomId,
    plan.quantity || plan.totalPlans || 1,
    warehouseId,
    siteId,
    options
  );

  plan.materialStatus = matCheck;
  plan.updatedBy = req.user ? req.user.id : null;
  await plan.save();

  res.status(200).json({
    success: true,
    materialStatus: matCheck,
    data: plan,
  });
});

// @desc    Approve a scheduled production plan
// @route   POST /api/production-plans/:id/approve
// @access  Private
exports.approveProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  plan.approvedBy = req.user ? req.user.id : null;
  plan.approvedAt = new Date();
  plan.updatedBy = req.user ? req.user.id : null;

  plan.auditHistory.push({
    action: 'APPROVE_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan approved by ${req.user ? req.user.username : 'Planner'}`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.planNumber} approved successfully.`
  });
});

// @desc    Use / release a specified number of available plans into a Production Order
// @route   POST /api/production-plans/:id/use
// @access  Private
exports.useProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Production plan not found' });

  const quantityToUse = Math.max(1, parseInt(req.body.quantity || req.body.plansToUse || 1, 10));

  if (quantityToUse > plan.availablePlans) {
    return res.status(400).json({
      success: false,
      error: `Requested quantity (${quantityToUse}) exceeds available plans (${plan.availablePlans}).`
    });
  }

  // Material Availability Validation for requested quantity
  let materialStatus;
  if (plan.bomId) {
    materialStatus = await MRPEngineService.checkMaterialAvailability(plan.bomId, quantityToUse, plan.warehouseId);
  }

  // Build component requirements for this batch
  let orderComponents = [];
  if (plan.ingredients && plan.ingredients.length > 0) {
    orderComponents = plan.ingredients.map(ing => {
      const lossMultiplier = 1 + ((ing.lossPercentage || 0) / 100);
      const expectedQty = Math.round((ing.quantityPerPlan * quantityToUse * lossMultiplier) * 10000) / 10000;
      return {
        materialId: ing.material || ing.materialId,
        expectedQuantity: expectedQty,
        consumedQuantity: 0,
        lossPercent: ing.lossPercentage || 0,
        expectedCost: 0,
      };
    });
  } else if (plan.bomId) {
    const bom = await BOM.findById(plan.bomId).populate('components.materialId');
    const batchSize = bom?.batchSize || 1;
    orderComponents = (bom?.components || []).map(comp => {
      const compQty = comp.quantity || comp.qty || 1;
      const lossPct = comp.lossPercentage || 0;
      const expectedQty = (quantityToUse * (compQty / batchSize)) * (1 + lossPct / 100);
      return {
        materialId: comp.materialId?._id || comp.materialId,
        expectedQuantity: Math.round(expectedQty * 10000) / 10000,
        consumedQuantity: 0,
        lossPercent: lossPct,
        expectedCost: 0,
      };
    });
  }

  const prdNumber = await nextSeqNumber('productionOrder', 'PRD');

  const order = await ProductionOrder.create({
    prdNumber,
    orderNumber: prdNumber,
    planId: plan._id,
    sourcePlanId: plan._id,
    productId: plan.productId,
    bomId: plan.bomId,
    siteId: plan.siteId,
    sourceWarehouseId: plan.warehouseId,
    destinationWarehouseId: plan.warehouseId,
    targetQuantity: quantityToUse,
    plannedQuantity: quantityToUse,
    completedQuantity: 0,
    rejectedQuantity: 0,
    status: 'DRAFT',
    scheduledStartDate: plan.scheduledStartDate || plan.schedule?.productionDate || new Date(),
    scheduledEndDate: plan.scheduledEndDate || plan.requiredDate || new Date(Date.now() + 86400000 * 3),
    workCenter: plan.workCenter || plan.schedule?.lineId || 'Main Assembly Line 1',
    priority: plan.priority || 'MEDIUM',
    components: orderComponents,
    notes: `Created via partial release (${quantityToUse} plans) from Plan ${plan.planNumber}`,
    history: [{
      status: 'DRAFT',
      changedBy: req.user ? req.user.id : null,
      notes: `Production Order created for ${quantityToUse} plans from Plan ${plan.planNumber}`
    }],
    createdBy: req.user ? req.user.id : null,
  });

  // Atomically update plan counts
  plan.availablePlans -= quantityToUse;
  plan.releasedPlans += quantityToUse;
  plan.scheduledQuantity = plan.releasedPlans;
  plan.remainingQuantity = plan.availablePlans;
  if (plan.availablePlans === 0) {
    plan.status = 'RELEASED';
  }
  plan.releasedAt = new Date();
  plan.releasedBy = req.user ? req.user.id : null;
  plan.productionOrderId = order._id;
  plan.releasedProductionOrderId = order._id;

  plan.auditHistory.push({
    action: 'USE_PLANS',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Released ${quantityToUse} plans to Production Order ${order.prdNumber}. Available remaining: ${plan.availablePlans}, Total released: ${plan.releasedPlans}.`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    productionOrder: order,
    materialStatus,
    message: `Successfully released ${quantityToUse} plans into Production Order ${order.prdNumber}.`
  });
});

// @desc    Restore released plans when a linked ProductionOrder is cancelled before execution
// @route   POST /api/production-plans/:id/restore
// @access  Private
exports.restoreProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Production plan not found' });

  const { quantity, productionOrderId } = req.body;
  if (!productionOrderId) {
    return res.status(400).json({ success: false, error: 'productionOrderId is required for plan restoration.' });
  }

  const order = await ProductionOrder.findById(productionOrderId);
  if (!order) return res.status(404).json({ success: false, error: 'Production Order not found' });

  if (order.planId?.toString() !== plan._id.toString() && order.sourcePlanId?.toString() !== plan._id.toString()) {
    return res.status(400).json({ success: false, error: 'Production order does not belong to this plan' });
  }

  const orderStatus = (order.status || '').toUpperCase();
  if (orderStatus !== 'CANCELLED' && orderStatus !== 'DRAFT') {
    return res.status(400).json({ success: false, error: `Only CANCELLED or DRAFT production orders can be restored (Current order status: ${order.status})` });
  }

  if ((order.completedQuantity || 0) > 0) {
    return res.status(400).json({ success: false, error: 'Cannot restore plans from an order that already has completed production.' });
  }

  const restoreCount = Math.min(
    quantity ? parseInt(quantity, 10) : (order.targetQuantity || order.plannedQuantity || 1),
    plan.releasedPlans
  );

  if (restoreCount <= 0) {
    return res.status(400).json({ success: false, error: 'No released plans available to restore' });
  }

  plan.availablePlans += restoreCount;
  plan.releasedPlans = Math.max(0, plan.releasedPlans - restoreCount);
  plan.scheduledQuantity = plan.releasedPlans;
  plan.remainingQuantity = plan.availablePlans;

  if (plan.status === 'RELEASED' && plan.availablePlans > 0) {
    plan.status = plan.schedule?.productionDate ? 'SCHEDULED' : 'UNSCHEDULED';
  }

  plan.auditHistory.push({
    action: 'RESTORE_PLANS',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Restored ${restoreCount} plans from cancelled order ${order.prdNumber || order._id}. Available plans now: ${plan.availablePlans}.`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Successfully restored ${restoreCount} plans back to available pool.`
  });
});

// @desc    Release production plan → Forwards to useProductionPlan for all available plans
// @route   POST /api/production-plans/:id/release
// @access  Private
exports.releaseProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const releaseQty = req.body.quantity ? parseInt(req.body.quantity, 10) : (plan.availablePlans > 0 ? plan.availablePlans : (plan.totalPlans || plan.quantity));
  req.body.quantity = releaseQty;
  return exports.useProductionPlan(req, res, next);
});

// @desc    Hold production plan
// @route   POST /api/production-plans/:id/hold
// @access  Private
exports.holdProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const previousStatus = plan.status;
  plan.status = 'ON_HOLD';
  plan.remarks = req.body.reason || 'Placed on hold by planner';
  plan.updatedBy = req.user ? req.user.id : null;

  plan.auditHistory.push({
    action: 'HOLD_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan transitioned from ${previousStatus} to ON_HOLD. Reason: ${plan.remarks}`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.planNumber} is now ON_HOLD.`
  });
});

// @desc    Cancel production plan
// @route   POST /api/production-plans/:id/cancel
// @access  Private
exports.cancelProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const normalizedStatus = (plan.status || '').toUpperCase();
  if (normalizedStatus === 'COMPLETED') {
    return res.status(400).json({ success: false, error: 'Completed plans cannot be cancelled' });
  }

  // Cancel any linked non-started production orders
  if (plan.releasedProductionOrderId) {
    const order = await ProductionOrder.findById(plan.releasedProductionOrderId);
    if (order && !['COMPLETED', 'IN_PROGRESS', 'In Production'].includes(order.status)) {
      order.status = 'CANCELLED';
      await order.save();
    }
  }

  plan.status = 'CANCELLED';
  plan.cancelReason = req.body.reason || 'Cancelled by planner';
  plan.cancelledBy = req.user ? req.user.id : null;
  plan.cancelledAt = new Date();
  plan.updatedBy = req.user ? req.user.id : null;

  plan.auditHistory.push({
    action: 'CANCEL_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan cancelled. Reason: ${plan.cancelReason}`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.planNumber} cancelled successfully.`
  });
});

// @desc    Complete production plan
// @route   POST /api/production-plans/:id/complete
// @access  Private
exports.completeProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  plan.status = 'COMPLETED';
  plan.completedBy = req.user ? req.user.id : null;
  plan.completedAt = new Date();
  plan.updatedBy = req.user ? req.user.id : null;

  plan.auditHistory.push({
    action: 'COMPLETE_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan marked as COMPLETED by ${req.user ? req.user.username : 'User'}`,
  });

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.planNumber} marked as COMPLETED.`
  });
});

// Backwards-compatible helpers
exports.copyProductionPlan = asyncHandler(async (req, res, next) => {
  const sourcePlan = await ProductionPlan.findById(req.params.id);
  if (!sourcePlan) return res.status(404).json({ success: false, error: 'Source plan not found' });

  const planNumber = await nextSeqNumber('productionPlan', 'PLAN');
  const targetQuantity = req.body.quantity || sourcePlan.originalQuantity || sourcePlan.quantity;

  const newPlan = await ProductionPlan.create({
    planNumber,
    productId: sourcePlan.productId,
    product: sourcePlan.product || sourcePlan.productId,
    bomId: sourcePlan.bomId,
    bom: sourcePlan.bom || sourcePlan.bomId,
    siteId: sourcePlan.siteId,
    warehouseId: sourcePlan.warehouseId,
    quantity: targetQuantity,
    originalQuantity: targetQuantity,
    remainingQuantity: targetQuantity,
    requiredDate: req.body.requiredDate || new Date(Date.now() + 86400000 * 7),
    requiredByDate: req.body.requiredDate || new Date(Date.now() + 86400000 * 7),
    status: 'UNSCHEDULED',
    planSource: 'MANUAL',
    source: 'MANUAL',
    priority: sourcePlan.priority || 'MEDIUM',
    notes: `Copy of ${sourcePlan.planNumber}`,
    copiedFromPlanId: sourcePlan._id,
    createdBy: req.user ? req.user.id : null,
  });

  res.status(201).json({ success: true, data: newPlan, message: `Plan ${sourcePlan.planNumber} copied as ${newPlan.planNumber}` });
});

exports.unscheduleProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  plan.status = 'UNSCHEDULED';
  plan.schedule = undefined;
  plan.updatedBy = req.user ? req.user.id : null;
  await plan.save();

  res.status(200).json({ success: true, data: plan, message: `Plan ${plan.planNumber} unscheduled.` });
});

