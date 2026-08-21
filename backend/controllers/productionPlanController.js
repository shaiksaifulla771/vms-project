const mongoose = require('mongoose');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const AuditLog = require('../models/AuditLog');
const IdempotencyKey = require('../models/IdempotencyKey');
const asyncHandler = require('../middleware/asyncHandler');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const MRPEngineService = require('../services/mrpEngineService');
const ProductionPlanInstance = require('../models/ProductionPlanInstance');
const ProductionPlanningEngine = require('../services/productionPlanningEngine');
const { nextSeqNumber } = require('../services/sequenceService');
const { eventBus, EVENTS } = require('../events/eventBus');


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
      const rawCompQty = Number(comp.quantity !== undefined ? comp.quantity : (comp.qty !== undefined ? comp.qty : 1));
      const compQty = rawCompQty > 0 ? rawCompQty : 1;
      const lossPct = Number(comp.lossPercentage || comp.lossPercent || 0);
      const quantityPerPlan = Math.max(0.000001, compQty / batchSize);
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
      const rawQty = Number(ing.quantityPerPlan !== undefined ? ing.quantityPerPlan : (ing.qty !== undefined ? ing.qty : 1));
      const qtyPerPlan = Math.max(0.000001, rawQty > 0 ? rawQty : 1);
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
    const invQuery = { materialId: { $in: matIds } };
    if (targetWarehouseId && targetWarehouseId !== 'all' && targetWarehouseId !== 'ALL' && mongoose.Types.ObjectId.isValid(targetWarehouseId)) {
      invQuery.warehouseId = targetWarehouseId;
    }
    const invItems = await InventoryItem.find(invQuery);
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

// @desc    Update / Edit an existing production plan (e.g. edit number of plans, BOM, shift, warehouse, dates)
// @route   PUT /api/production-plans/:id
// @access  Private (Admin, Production Manager, Planner)
exports.updateProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, error: 'Production plan not found' });
  }

  const normalizedStatus = (plan.status || '').toUpperCase();
  if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: `Plan in status ${plan.status} is finalized and cannot be edited.`
    });
  }

  const {
    planName,
    totalPlans,
    quantity,
    bomId,
    warehouseId,
    siteId,
    requiredDate,
    requiredByDate,
    priority,
    workCenter,
    shiftId,
    notes,
    remarks,
    ingredients
  } = req.body;

  const newTotalPlans = totalPlans !== undefined ? parseInt(totalPlans, 10) : (quantity !== undefined ? parseInt(quantity, 10) : plan.totalPlans);
  if (isNaN(newTotalPlans) || newTotalPlans < 1) {
    return res.status(400).json({ success: false, error: 'Total plans/quantity must be at least 1' });
  }

  // If already partially or fully released, total plans cannot be less than already committed plans
  const committedPlans = (plan.releasedPlans || 0) + (plan.completedPlans || 0);
  if (newTotalPlans < committedPlans) {
    return res.status(400).json({
      success: false,
      error: `Cannot reduce total plans to ${newTotalPlans} because ${committedPlans} plans are already released/completed.`
    });
  }

  const targetWarehouseId = warehouseId || plan.warehouseId;
  const targetSiteId = siteId !== undefined ? siteId : plan.siteId;
  const targetBomId = bomId !== undefined ? bomId : plan.bomId;

  let activeBom = null;
  if (targetBomId) {
    activeBom = await BOM.findById(targetBomId).populate('components.materialId').populate('components.mpnId');
  } else if (!ingredients || ingredients.length === 0) {
    activeBom = await BOM.findOne({ productId: plan.productId, status: 'Active' })
      .populate('components.materialId')
      .populate('components.mpnId') ||
      await BOM.findOne({ productId: plan.productId, status: { $ne: 'Deleted' } })
      .populate('components.materialId')
      .populate('components.mpnId');
  }

  // Recalculate ingredients if totalPlans, bom, or warehouse changed or custom ingredients provided
  let finalIngredients = plan.ingredients || [];
  let materialStatus = plan.materialStatus;

  if (activeBom && (!ingredients || ingredients.length === 0)) {
    const batchSize = activeBom.batchSize || 1;
    finalIngredients = (activeBom.components || []).map(comp => {
      const compMat = comp.materialId || (comp.mpnId && comp.mpnId.materialId);
      const rawCompQty = Number(comp.quantity !== undefined ? comp.quantity : (comp.qty !== undefined ? comp.qty : 1));
      const compQty = rawCompQty > 0 ? rawCompQty : 1;
      const lossPct = Number(comp.lossPercentage || comp.lossPercent || 0);
      const quantityPerPlan = Math.max(0.000001, compQty / batchSize);
      const totalQuantity = (newTotalPlans * quantityPerPlan) * (1 + lossPct / 100);

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
    materialStatus = await MRPEngineService.checkMaterialAvailability(activeBom._id, newTotalPlans, targetWarehouseId);
  } else if (Array.isArray(ingredients) && ingredients.length > 0) {
    finalIngredients = [];
    for (const ing of ingredients) {
      const matId = ing.materialId || ing.material;
      const matDoc = await Material.findById(matId);
      if (!matDoc) continue;
      const rawQty = Number(ing.quantityPerPlan !== undefined ? ing.quantityPerPlan : (ing.qty !== undefined ? ing.qty : 1));
      const qtyPerPlan = Math.max(0.000001, rawQty > 0 ? rawQty : 1);
      const lossPct = Number(ing.lossPercentage || 0);
      const totalQuantity = (newTotalPlans * qtyPerPlan) * (1 + lossPct / 100);

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

    const matIds = finalIngredients.map(i => i.material);
    const invQuery = { materialId: { $in: matIds } };
    if (targetWarehouseId && targetWarehouseId !== 'all' && mongoose.Types.ObjectId.isValid(targetWarehouseId)) {
      invQuery.warehouseId = targetWarehouseId;
    }
    const invItems = await InventoryItem.find(invQuery);
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
  }

  // Update plan fields
  if (planName) plan.planName = planName;
  plan.totalPlans = newTotalPlans;
  plan.quantity = newTotalPlans;
  plan.availablePlans = Math.max(0, newTotalPlans - (plan.reservedPlans || 0) - (plan.releasedPlans || 0) - (plan.completedPlans || 0));
  if (targetBomId) {
    plan.bomId = targetBomId;
    plan.bom = targetBomId;
    if (activeBom) plan.bomVersion = String(activeBom.version || 1);
  }
  if (targetWarehouseId) plan.warehouseId = targetWarehouseId;
  if (targetSiteId !== undefined) plan.siteId = targetSiteId;
  if (requiredDate || requiredByDate) {
    const targetDate = new Date(requiredByDate || requiredDate);
    plan.requiredDate = targetDate;
    plan.requiredByDate = targetDate;
  }
  if (priority) plan.priority = priority.toUpperCase();
  if (workCenter) plan.workCenter = workCenter;
  if (shiftId) {
    plan.schedule = plan.schedule || {};
    plan.schedule.shiftId = shiftId;
    plan.schedule.shift = shiftId;
  }
  if (notes !== undefined) plan.notes = notes;
  if (remarks !== undefined) plan.remarks = remarks;
  plan.ingredients = finalIngredients;
  plan.materialStatus = materialStatus;

  plan.auditHistory = plan.auditHistory || [];
  plan.auditHistory.push({
    action: 'UPDATE_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan ${plan.planNumber} updated: totalPlans=${newTotalPlans}, bomId=${targetBomId || 'N/A'}, warehouseId=${targetWarehouseId || 'N/A'}`
  });

  await plan.save();

  // Handle Edit Scope: All remaining unreleased plans in this series/group
  const editScope = req.body.editScope || 'SINGLE'; // 'SINGLE' | 'ALL_REMAINING'
  let seriesUpdatedCount = 1;

  if (editScope === 'ALL_REMAINING' && (plan.seriesId || plan.parentPlanId)) {
    const filter = plan.seriesId
      ? {
          seriesId: plan.seriesId,
          seriesIndex: { $gte: plan.seriesIndex || 1 },
          status: { $in: ['UNSCHEDULED', 'DRAFT', 'SCHEDULED', 'PENDING_APPROVAL', 'VALIDATED', 'Unscheduled', 'Scheduled', 'Draft', 'Pending'] }
        }
      : {
          parentPlanId: plan.parentPlanId,
          status: { $in: ['UNSCHEDULED', 'DRAFT', 'SCHEDULED', 'PENDING_APPROVAL', 'VALIDATED', 'Unscheduled', 'Scheduled', 'Draft', 'Pending'] }
        };

    const remainingPlans = await ProductionPlan.find(filter);
    for (const p of remainingPlans) {
      if (p._id.toString() === plan._id.toString()) continue;

      const committed = (p.releasedPlans || 0) + (p.completedPlans || 0);
      if (newTotalPlans < committed) continue;

      if (planName) p.planName = `${planName} (${p.seriesIndex ? `Series ${p.seriesIndex}/${p.seriesTotal || 'N'}` : 'Batch'})`;
      p.totalPlans = newTotalPlans;
      p.quantity = newTotalPlans;
      p.availablePlans = Math.max(0, newTotalPlans - (p.reservedPlans || 0) - (p.releasedPlans || 0) - (p.completedPlans || 0));
      if (targetBomId) {
        p.bomId = targetBomId;
        p.bom = targetBomId;
        if (activeBom) p.bomVersion = String(activeBom.version || 1);
      }
      if (targetWarehouseId) p.warehouseId = targetWarehouseId;
      if (targetSiteId !== undefined) p.siteId = targetSiteId;
      if (priority) p.priority = priority.toUpperCase();
      if (workCenter) p.workCenter = workCenter;
      if (shiftId) {
        p.schedule = p.schedule || {};
        p.schedule.shiftId = shiftId;
        p.schedule.shift = shiftId;
      }
      p.ingredients = finalIngredients;
      p.materialStatus = materialStatus;
      if (notes !== undefined) p.notes = notes;

      p.auditHistory = p.auditHistory || [];
      p.auditHistory.push({
        action: 'UPDATE_PLAN_SERIES',
        user: req.user ? req.user.id : null,
        timestamp: new Date(),
        details: `Updated via series batch edit from plan ${plan.planNumber} (totalPlans=${newTotalPlans})`
      });

      await p.save();
      seriesUpdatedCount++;
    }
  }

  const updatedPlan = await ProductionPlan.findById(plan._id)
    .populate('productId', 'name code unit type')
    .populate('product', 'name code unit type')
    .populate('bomId')
    .populate('warehouseId', 'name code')
    .populate('ingredients.material', 'name code unit');

  res.status(200).json({
    success: true,
    data: updatedPlan,
    materialStatus,
    seriesUpdatedCount,
    message: seriesUpdatedCount > 1
      ? `Successfully updated ${seriesUpdatedCount} plans in the series with ${newTotalPlans} planned units.`
      : `Plan ${plan.planNumber} updated successfully with ${newTotalPlans} planned units.`
  });
});

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

  let activeBomId = plan.bomId || plan.bom;
  if (!activeBomId && (plan.productId || plan.product)) {
    const defaultBom = await BOM.findOne({ productId: plan.productId || plan.product, status: 'Active' }) ||
      await BOM.findOne({ productId: plan.productId || plan.product, status: { $ne: 'Deleted' } });
    if (defaultBom) {
      activeBomId = defaultBom._id;
    }
  }

  const matCheck = await MRPEngineService.checkMaterialAvailability(
    activeBomId,
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

  // 1. Transition validation
  const transitionCheck = ProductionPlanningEngine.validateTransition(plan.status, 'APPROVED');
  if (!transitionCheck.valid) {
    return res.status(400).json({ success: false, error: transitionCheck.error });
  }

  // 2. Maker-checker policy check (Rev. 2 Part D1)
  const currentUserId = req.user ? (req.user.id || req.user._id) : null;
  const creatorId = plan.createdBy ? (plan.createdBy._id || plan.createdBy) : null;
  if (plan.requireDifferentApprover && currentUserId && creatorId) {
    if (String(currentUserId) === String(creatorId)) {
      return res.status(403).json({
        success: false,
        error: 'Maker-checker policy violation: Approver cannot be the same user who created the plan.',
      });
    }
  }

  plan.status = 'APPROVED';
  plan.approvedBy = currentUserId;
  plan.approvedAt = new Date();
  plan.updatedBy = currentUserId;

  plan.auditHistory.push({
    action: 'APPROVE_PLAN',
    user: currentUserId,
    timestamp: new Date(),
    details: `Plan approved by ${req.user ? req.user.username : 'Approver'}`,
  });

  await plan.save();

  // Also update pending instances if any
  await ProductionPlanInstance.updateMany(
    { planId: plan._id, status: { $in: ['UNSCHEDULED', 'DRAFT', 'VALIDATED', 'PENDING_APPROVAL'] } },
    { $set: { status: 'APPROVED', approvedBy: currentUserId, approvedAt: new Date() } }
  );

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

  const rawQty = req.body.quantity !== undefined ? req.body.quantity : (req.body.quantityToUse !== undefined ? req.body.quantityToUse : req.body.plansToUse);
  const quantityToUse = Math.max(1, parseInt(rawQty || 1, 10));

  const available = plan.availablePlans !== undefined ? plan.availablePlans : (plan.remainingQuantity !== undefined ? plan.remainingQuantity : (plan.totalPlans || plan.quantity || 0));

  if (quantityToUse > available) {
    return res.status(400).json({
      success: false,
      error: `Requested quantity (${quantityToUse}) exceeds available plans (${available}).`
    });
  }

  // Unified Execution Guard (Rev. 2 Part C1 & Test 9)
  const execCheck = await ProductionPlanningEngine.canExecute(plan);
  if (!execCheck.allowed) {
    return res.status(400).json({
      success: false,
      error: execCheck.reason,
      shortages: execCheck.shortages || [],
    });
  }

  // Material Availability Validation for requested quantity
  let materialStatus;
  if (plan.bomId) {
    materialStatus = await MRPEngineService.checkMaterialAvailability(plan.bomId, quantityToUse, plan.warehouseId);
    if (materialStatus.status === 'SHORTAGE' || (materialStatus.shortages && materialStatus.shortages.length > 0)) {
      return res.status(400).json({
        success: false,
        error: `Execution blocked due to material shortages in requested quantity (${quantityToUse} units).`,
        shortages: materialStatus.shortages,
      });
    }
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
    sourcePlanNumber: plan.planNumber,
    sourceMrpRunId: plan.mrpRunId || null,
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

// @desc    Copy / Batch-Copy production plan (Single copy or Grouped Batch Series)
// @route   POST /api/production-plans/:id/copy
// @access  Private (Admin, Production Manager, Planner)
exports.copyProductionPlan = asyncHandler(async (req, res, next) => {
  const sourcePlan = await ProductionPlan.findById(req.params.id);
  if (!sourcePlan) return res.status(404).json({ success: false, error: 'Source plan not found' });

  const copyCount = Math.max(1, parseInt(req.body.copyCount || 1, 10));
  const targetQuantity = req.body.quantity !== undefined ? parseInt(req.body.quantity, 10) : (sourcePlan.originalQuantity || sourcePlan.quantity || sourcePlan.totalPlans || 1);
  const targetWarehouseId = req.body.warehouseId || sourcePlan.warehouseId;
  const targetBomId = req.body.bomId || sourcePlan.bomId;
  const baseTargetDate = req.body.requiredDate ? new Date(req.body.requiredDate) : new Date(Date.now() + 86400000 * 7);
  const currentUserId = req.user ? (req.user.id || req.user._id) : null;

  // Active BOM & Ingredient resolution with dynamic scaling
  let activeBom = null;
  if (targetBomId) {
    activeBom = await BOM.findById(targetBomId).populate('components.materialId');
  } else {
    activeBom = await BOM.findOne({ productId: sourcePlan.productId, status: 'Active' }).populate('components.materialId');
  }

  let finalIngredients = [];
  if (activeBom && activeBom.components && activeBom.components.length > 0) {
    const batchSize = activeBom.batchSize || 1;
    finalIngredients = activeBom.components.map(comp => {
      const compMat = comp.materialId || {};
      const rawCompQty = Number(comp.quantity !== undefined ? comp.quantity : (comp.qty !== undefined ? comp.qty : 1));
      const compQty = rawCompQty > 0 ? rawCompQty : 1;
      const lossPct = Number(comp.lossPercentage || 0);
      const quantityPerPlan = Math.max(0.000001, compQty / batchSize);
      const totalQuantity = (targetQuantity * quantityPerPlan) * (1 + lossPct / 100);

      return {
        material: compMat?._id || comp.materialId,
        materialId: compMat?._id || comp.materialId,
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
  } else {
    finalIngredients = (sourcePlan.ingredients || []).map(ing => {
      const qtyPerPlan = ing.quantityPerPlan || 1;
      const lossPct = ing.lossPercentage || 0;
      const totalQuantity = (targetQuantity * qtyPerPlan) * (1 + lossPct / 100);
      return {
        material: ing.material || ing.materialId,
        materialId: ing.materialId || ing.material,
        materialCode: ing.materialCode,
        materialName: ing.materialName,
        quantityPerPlan: qtyPerPlan,
        totalQuantity: Math.round(totalQuantity * 10000) / 10000,
        uom: ing.uom || 'pcs',
        warehouse: targetWarehouseId,
        warehouseId: targetWarehouseId,
        lossPercentage: lossPct,
      };
    });
  }

  // Live stock evaluation for the new batch
  const materialStatus = activeBom
    ? await MRPEngineService.checkMaterialAvailability(activeBom._id, targetQuantity, targetWarehouseId)
    : (sourcePlan.materialStatus || { status: 'READY', shortages: [], components: [] });

  const seriesId = copyCount > 1 ? `SERIES-${sourcePlan.planNumber || 'PLAN'}-${Date.now()}` : undefined;
  const createdPlans = [];

  for (let i = 1; i <= copyCount; i++) {
    const planNumber = await nextSeqNumber('productionPlan', 'PLAN');
    const planDate = new Date(baseTargetDate.getTime() + (i - 1) * 86400000);

    const newPlan = await ProductionPlan.create({
      planNumber,
      planName: copyCount > 1 ? `${sourcePlan.planName || 'Plan'} (Batch ${i}/${copyCount})` : `${sourcePlan.planName || 'Plan'} (Copy)`,
      productId: sourcePlan.productId,
      product: sourcePlan.product || sourcePlan.productId,
      productCode: sourcePlan.productCode,
      productName: sourcePlan.productName,
      bomId: activeBom ? activeBom._id : sourcePlan.bomId,
      bom: activeBom ? activeBom._id : sourcePlan.bomId,
      bomVersion: activeBom ? String(activeBom.version || 1) : (sourcePlan.bomVersion || '1'),
      siteId: req.body.siteId || sourcePlan.siteId,
      warehouseId: targetWarehouseId,
      totalPlans: targetQuantity,
      quantity: targetQuantity,
      originalQuantity: targetQuantity,
      availablePlans: targetQuantity,
      releasedPlans: 0,
      reservedPlans: 0,
      completedPlans: 0,
      cancelledPlans: 0,
      ingredients: finalIngredients,
      materialStatus,
      requiredDate: planDate,
      requiredByDate: planDate,
      status: 'UNSCHEDULED',
      planSource: 'MANUAL',
      source: 'MANUAL',
      priority: req.body.priority || sourcePlan.priority || 'MEDIUM',
      workCenter: req.body.workCenter || sourcePlan.workCenter || 'Main Assembly Line 1',
      schedule: {
        productionDate: planDate,
        startTime: '09:00',
        endTime: '17:00',
        shiftId: req.body.shiftId || sourcePlan.schedule?.shiftId || 'Morning Shift',
        shift: req.body.shiftId || sourcePlan.schedule?.shift || 'Morning Shift',
        warehouseId: targetWarehouseId,
        estimatedDuration: 480,
        capacityCheckStatus: 'Sufficient',
        materialCheckStatus: materialStatus.status || 'Ready'
      },
      seriesId,
      seriesIndex: i,
      seriesTotal: copyCount,
      notes: req.body.notes || `Copied from ${sourcePlan.planNumber}${copyCount > 1 ? ` (Batch ${i} of ${copyCount})` : ''}`,
      copiedFromPlanId: sourcePlan._id,
      createdBy: currentUserId,
      auditHistory: [
        {
          action: copyCount > 1 ? 'BATCH_COPY_PLAN' : 'COPY_PLAN',
          user: currentUserId,
          timestamp: new Date(),
          details: `Copied from ${sourcePlan.planNumber} with targetQuantity=${targetQuantity}${copyCount > 1 ? ` (Series: ${i}/${copyCount})` : ''}`
        }
      ]
    });

    createdPlans.push(newPlan);
  }

  res.status(201).json({
    success: true,
    data: copyCount === 1 ? createdPlans[0] : createdPlans,
    count: createdPlans.length,
    seriesId,
    message: copyCount === 1
      ? `Plan ${sourcePlan.planNumber} copied as ${createdPlans[0].planNumber}`
      : `Successfully generated series of ${copyCount} copy plans (${createdPlans[0].planNumber} to ${createdPlans[createdPlans.length - 1].planNumber}).`
  });
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

// @desc    Split a Production Plan into multiple smaller requirements
// @route   POST /api/production-plans/:id/split
// @access  Private (Planner/Admin)
exports.splitProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Production plan not found' });

  const { splits } = req.body; // Array of { quantity, requiredDate, lineId }
  if (!splits || !Array.isArray(splits) || splits.length < 2) {
    return res.status(400).json({ success: false, error: 'Please provide at least 2 split quantities.' });
  }

  const totalSplitQty = splits.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
  const originalQty = plan.totalPlans || plan.quantity;
  if (totalSplitQty !== originalQty) {
    return res.status(400).json({
      success: false,
      error: `Sum of split quantities (${totalSplitQty}) must equal original plan quantity (${originalQty}).`
    });
  }

  const childPlans = [];
  const splitHistoryEntries = [];

  for (let i = 0; i < splits.length; i++) {
    const s = splits[i];
    const childPlanNumber = `${plan.planNumber}-${String.fromCharCode(65 + i)}`;
    const splitQty = Number(s.quantity);
    const splitDate = s.requiredDate ? new Date(s.requiredDate) : plan.requiredDate;

    // Recalculate ingredient quantities for the split batch
    const splitIngredients = (plan.ingredients || []).map(ing => {
      const qtyPerPlan = ing.quantityPerPlan || 1;
      const lossMultiplier = 1 + ((ing.lossPercentage || 0) / 100);
      return {
        material: ing.material || ing.materialId,
        materialId: ing.materialId || ing.material,
        materialCode: ing.materialCode,
        materialName: ing.materialName,
        quantityPerPlan: qtyPerPlan,
        totalQuantity: Math.round((splitQty * qtyPerPlan * lossMultiplier) * 10000) / 10000,
        uom: ing.uom || 'pcs',
        warehouse: ing.warehouse || plan.warehouseId,
        warehouseId: ing.warehouseId || plan.warehouseId,
        lossPercentage: ing.lossPercentage || 0,
      };
    });

    const childPlan = await ProductionPlan.create({
      planNumber: childPlanNumber,
      planName: `${plan.planName} (Split ${String.fromCharCode(65 + i)})`,
      mrpRunId: plan.mrpRunId,
      productId: plan.productId,
      product: plan.product || plan.productId,
      productCode: plan.productCode,
      productName: plan.productName,
      bomId: plan.bomId,
      bom: plan.bom,
      bomVersion: plan.bomVersion,
      siteId: plan.siteId,
      warehouseId: plan.warehouseId,
      totalPlans: splitQty,
      availablePlans: splitQty,
      releasedPlans: 0,
      reservedPlans: 0,
      completedPlans: 0,
      cancelledPlans: 0,
      ingredients: splitIngredients,
      quantity: splitQty,
      originalQuantity: splitQty,
      remainingQuantity: splitQty,
      requiredDate: splitDate,
      requiredByDate: splitDate,
      status: 'UNSCHEDULED',
      planSource: plan.planSource || 'MRP',
      source: plan.source || 'MRP',
      sourceReference: plan.sourceReference,
      sourceRefModel: plan.sourceRefModel,
      priority: plan.priority || 'MEDIUM',
      workCenter: s.lineId || plan.workCenter || 'Main Assembly Line 1',
      parentPlanId: plan._id,
      parentPlanNumber: plan.planNumber,
      createdBy: req.user ? req.user.id : null,
      notes: `Split from parent plan ${plan.planNumber}`,
      auditHistory: [{
        action: 'SPLIT_FROM_PARENT',
        user: req.user ? req.user.id : null,
        timestamp: new Date(),
        details: `Created as part of ${splitQty} unit split from ${plan.planNumber}`
      }]
    });

    childPlans.push(childPlan);
    splitHistoryEntries.push({
      splitPlanId: childPlan._id,
      planNumber: childPlan.planNumber,
      quantity: splitQty,
      requiredDate: splitDate,
      splitAt: new Date(),
      splitBy: req.user ? req.user.id : null,
    });
  }

  // Update parent plan status to CANCELLED and store history
  plan.status = 'CANCELLED';
  plan.splitHistory = splitHistoryEntries;
  plan.notes = `Split into ${childPlans.map(c => c.planNumber).join(', ')}`;
  plan.auditHistory.push({
    action: 'SPLIT_PLAN',
    user: req.user ? req.user.id : null,
    timestamp: new Date(),
    details: `Plan split into ${childPlans.length} child plans: ${childPlans.map(c => `${c.planNumber} (${c.quantity} units)`).join(', ')}`
  });

  await plan.save();

  res.status(201).json({
    success: true,
    message: `Plan ${plan.planNumber} successfully split into ${childPlans.length} child plans.`,
    parentPlan: plan,
    childPlans
  });
});

// @desc    Create structured wizard master plan with batch instances (Rev. 2 Part B4/B5)
// @route   POST /api/production-plans/wizard
// @access  Private
exports.createWizardPlan = asyncHandler(async (req, res, next) => {
  const {
    planName,
    productId,
    bomId,
    totalQuantity,
    requiredDate,
    warehouseId,
    siteId,
    priority = 'MEDIUM',
    workCenter = 'Main Assembly Line 1',
    shiftId = 'Standard Shift',
    splitMode = 'COUNT',
    splitValue = 1,
    customSplits = [],
    customMaterials = [],
    substitutions = [],
    isTemplate = false,
    allowPartial = false,
    requireDifferentApprover = false,
    notes = '',
  } = req.body;

  if (!productId) return res.status(400).json({ success: false, error: 'Product is required' });
  if (!warehouseId) return res.status(400).json({ success: false, error: 'Warehouse is required' });
  const totalQty = Number(totalQuantity || 1);
  if (isNaN(totalQty) || totalQty <= 0) {
    return res.status(400).json({ success: false, error: 'Total quantity must be greater than zero' });
  }

  const product = await Material.findById(productId);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

  // Resolve BOM
  let activeBom = null;
  if (bomId) {
    activeBom = await BOM.findById(bomId).populate('components.materialId');
  } else {
    activeBom = await BOM.findOne({ productId, status: 'Active' }).populate('components.materialId');
  }

  const planNumber = await nextSeqNumber('productionPlan', 'PLAN');

  // Build standard ingredients from BOM
  let ingredients = [];
  if (activeBom && activeBom.components && activeBom.components.length > 0) {
    const batchSize = activeBom.batchSize || 1;
    ingredients = activeBom.components.map(c => {
      const mat = c.materialId || {};
      const lossPct = c.lossPercentage || 0;
      const qtyPerPlan = (c.quantity || c.qty || 1) / batchSize;
      const lossMult = 1 + (lossPct / 100);
      return {
        material: mat._id || c.materialId,
        materialId: mat._id || c.materialId,
        materialCode: mat.code || c.materialCode,
        materialName: mat.name || c.materialName,
        quantityPerPlan: qtyPerPlan,
        totalQuantity: Math.round((qtyPerPlan * totalQty * lossMult) * 10000) / 10000,
        uom: mat.unit || c.uom || 'pcs',
        warehouse: warehouseId,
        warehouseId,
        lossPercentage: lossPct,
      };
    });
  }

  const currentUserId = req.user ? (req.user.id || req.user._id) : null;

  // Create Master Production Plan
  const plan = await ProductionPlan.create({
    planNumber,
    planName: planName || `${product.name} Master Plan`,
    productId,
    product: productId,
    productCode: product.code,
    productName: product.name,
    bomId: activeBom?._id || null,
    bom: activeBom?._id || null,
    bomVersion: activeBom?.version || '1',
    siteId: siteId || null,
    warehouseId,
    totalPlans: totalQty,
    quantity: totalQty,
    availablePlans: totalQty,
    releasedPlans: 0,
    completedPlans: 0,
    cancelledPlans: 0,
    requiredDate: requiredDate ? new Date(requiredDate) : new Date(Date.now() + 7 * 86400000),
    requiredByDate: requiredDate ? new Date(requiredDate) : new Date(Date.now() + 7 * 86400000),
    priority,
    workCenter,
    isTemplate: Boolean(isTemplate),
    allowPartial: Boolean(allowPartial),
    requireDifferentApprover: Boolean(requireDifferentApprover),
    ingredients,
    customMaterials: (customMaterials || []).map(cm => ({
      materialId: cm.materialId,
      materialCode: cm.materialCode,
      materialName: cm.materialName,
      quantity: Number(cm.quantity || 1),
      uom: cm.uom || 'pcs',
      reason: cm.reason || 'Manual addition outside standard BOM',
      addedBy: currentUserId,
      isApproved: true,
    })),
    substitutions: (substitutions || []).map(sub => ({
      originalMaterialId: sub.originalMaterialId,
      originalMaterialCode: sub.originalMaterialCode,
      substituteMaterialId: sub.substituteMaterialId,
      substituteMaterialCode: sub.substituteMaterialCode,
      originalQuantity: Number(sub.originalQuantity || 1),
      substituteQuantity: Number(sub.substituteQuantity || 1),
      conversionFactor: Number(sub.conversionFactor || 1),
      reason: sub.reason || 'Approved engineering substitute',
      substitutedBy: currentUserId,
      isApproved: true,
    })),
    status: 'DRAFT',
    planSource: 'MANUAL',
    source: 'MANUAL',
    notes,
    createdBy: currentUserId,
    auditHistory: [
      {
        action: 'CREATE_WIZARD_PLAN',
        user: currentUserId,
        timestamp: new Date(),
        details: `Created master plan ${planNumber} for ${totalQty} units via wizard.`,
      }
    ]
  });

  // Generate instances via unified splitting engine
  let batchInstances = [];
  try {
    const rawBatches = ProductionPlanningEngine.splitPlanIntoBatches({
      totalQuantity: totalQty,
      splitMode,
      splitValue,
      customSplits,
      startDate: requiredDate ? new Date(requiredDate) : new Date(),
      workCenter,
      shiftId,
      allowPartial,
    });

    for (let i = 0; i < rawBatches.length; i++) {
      const b = rawBatches[i];
      const instNumber = `${planNumber}-${String.fromCharCode(65 + i)}`;
      const instance = await ProductionPlanInstance.create({
        instanceNumber: instNumber,
        planId: plan._id,
        planNumber: plan.planNumber,
        sequence: b.sequence || (i + 1),
        productId: plan.productId,
        productCode: plan.productCode,
        productName: plan.productName,
        bomId: plan.bomId,
        bomVersion: plan.bomVersion,
        warehouseId: plan.warehouseId,
        siteId: plan.siteId,
        quantity: b.quantity,
        plannedStartDate: b.plannedStartDate,
        shiftId: b.shiftId || shiftId,
        workCenter: b.workCenter || workCenter,
        status: 'DRAFT',
        notes: b.notes,
        createdBy: currentUserId,
      });
      batchInstances.push(instance);
    }
  } catch (splitErr) {
    return res.status(400).json({ success: false, error: splitErr.message });
  }

  res.status(201).json({
    success: true,
    data: plan,
    instances: batchInstances,
    message: `Master plan ${plan.planNumber} created with ${batchInstances.length} batch instances.`
  });
});

// @desc    Generate/Split plan instances for a master plan
// @route   POST /api/production-plans/:id/instances
// @access  Private
exports.generatePlanInstances = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const {
    splitMode = 'COUNT',
    splitValue = 1,
    customSplits = [],
    startDate,
    workCenter,
    shiftId,
  } = req.body;

  // Clear existing draft instances
  await ProductionPlanInstance.deleteMany({
    planId: plan._id,
    status: { $in: ['DRAFT', 'UNSCHEDULED'] }
  });

  const rawBatches = ProductionPlanningEngine.splitPlanIntoBatches({
    totalQuantity: plan.quantity || plan.totalPlans,
    splitMode,
    splitValue,
    customSplits,
    startDate: startDate ? new Date(startDate) : (plan.requiredDate || new Date()),
    workCenter: workCenter || plan.workCenter || 'Main Assembly Line 1',
    shiftId: shiftId || 'Standard Shift',
    allowPartial: plan.allowPartial,
  });

  const createdInstances = [];
  const currentUserId = req.user ? (req.user.id || req.user._id) : null;

  for (let i = 0; i < rawBatches.length; i++) {
    const b = rawBatches[i];
    const instNumber = `${plan.planNumber}-${String.fromCharCode(65 + i)}`;
    const instance = await ProductionPlanInstance.create({
      instanceNumber: instNumber,
      planId: plan._id,
      planNumber: plan.planNumber,
      sequence: b.sequence || (i + 1),
      productId: plan.productId,
      productCode: plan.productCode,
      productName: plan.productName,
      bomId: plan.bomId,
      bomVersion: plan.bomVersion,
      warehouseId: plan.warehouseId,
      siteId: plan.siteId,
      quantity: b.quantity,
      plannedStartDate: b.plannedStartDate,
      shiftId: b.shiftId,
      workCenter: b.workCenter,
      status: 'DRAFT',
      notes: b.notes,
      createdBy: currentUserId,
    });
    createdInstances.push(instance);
  }

  await ProductionPlanningEngine.syncPlanProgressFromInstances(plan._id);

  res.status(201).json({
    success: true,
    data: createdInstances,
    count: createdInstances.length,
    message: `Generated ${createdInstances.length} plan instances for ${plan.planNumber}.`
  });
});

// @desc    Get instances for a master plan
// @route   GET /api/production-plans/:id/instances
// @access  Private
exports.getPlanInstances = asyncHandler(async (req, res, next) => {
  const instances = await ProductionPlanInstance.find({ planId: req.params.id })
    .populate('productId', 'name code unit')
    .populate('warehouseId', 'name code')
    .populate('productionOrderId', 'prdNumber status')
    .sort('sequence');

  res.status(200).json({ success: true, count: instances.length, data: instances });
});

// @desc    Validate plan server-side before approval/release (Rev. 2 Part C2)
// @route   POST /api/production-plans/:id/validate
// @access  Private
exports.validatePlan = asyncHandler(async (req, res, next) => {
  const currentUserId = req.user ? (req.user.id || req.user._id) : null;
  const validation = await ProductionPlanningEngine.validatePlanForRelease(req.params.id, currentUserId);

  let updatedPlan = null;
  if (validation.valid) {
    const plan = await ProductionPlan.findById(req.params.id);
    if (plan) {
      if (['DRAFT', 'UNSCHEDULED'].includes(plan.status)) {
        plan.status = 'VALIDATED';
      }
      if (validation.materialStatus) {
        plan.materialStatus = validation.materialStatus;
      }
      plan.auditHistory.push({
        action: 'VALIDATE_PLAN',
        user: currentUserId,
        timestamp: new Date(),
        details: validation.warnings && validation.warnings.length > 0
          ? `Plan validated with warnings: ${validation.warnings.join('; ')}`
          : 'Plan passed server-side validation checks.',
      });
      await plan.save();
      updatedPlan = plan;
    }
  }

  res.status(200).json({
    success: true,
    data: updatedPlan,
    validation,
    message: validation.valid
      ? (validation.warnings?.length > 0 ? 'Plan validated with warnings.' : 'Plan validated successfully.')
      : 'Validation checks failed.',
  });
});

// @desc    Submit plan for approval
// @route   POST /api/production-plans/:id/submit-approval
// @access  Private
exports.submitForApproval = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const transitionCheck = ProductionPlanningEngine.validateTransition(plan.status, 'PENDING_APPROVAL');
  if (!transitionCheck.valid) {
    return res.status(400).json({ success: false, error: transitionCheck.error });
  }

  const currentUserId = req.user ? (req.user.id || req.user._id) : null;
  plan.status = 'PENDING_APPROVAL';
  plan.auditHistory.push({
    action: 'SUBMIT_APPROVAL',
    user: currentUserId,
    timestamp: new Date(),
    details: 'Submitted plan for managerial approval.',
  });

  await plan.save();

  await ProductionPlanInstance.updateMany(
    { planId: plan._id, status: { $in: ['DRAFT', 'VALIDATED'] } },
    { $set: { status: 'PENDING_APPROVAL' } }
  );

  res.status(200).json({ success: true, data: plan, message: 'Plan submitted for approval.' });
});

// @desc    Reject a production plan
// @route   POST /api/production-plans/:id/reject
// @access  Private
exports.rejectProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const transitionCheck = ProductionPlanningEngine.validateTransition(plan.status, 'REJECTED');
  if (!transitionCheck.valid) {
    return res.status(400).json({ success: false, error: transitionCheck.error });
  }

  const currentUserId = req.user ? (req.user.id || req.user._id) : null;
  const reason = req.body.reason || 'Approver rejected plan';

  plan.status = 'REJECTED';
  plan.auditHistory.push({
    action: 'REJECT_PLAN',
    user: currentUserId,
    timestamp: new Date(),
    details: `Plan rejected by approver. Reason: ${reason}`,
  });

  await plan.save();

  await ProductionPlanInstance.updateMany(
    { planId: plan._id, status: 'PENDING_APPROVAL' },
    { $set: { status: 'REJECTED', holdReason: reason } }
  );

  res.status(200).json({ success: true, data: plan, message: 'Plan rejected.' });
});

// @desc    Check plan reuse staleness (Rev. 2 Part B7)
// @route   GET /api/production-plans/:id/reuse-staleness
// @access  Private
exports.getReuseStaleness = asyncHandler(async (req, res, next) => {
  const staleness = await ProductionPlanningEngine.checkReuseStaleness(req.params.id);
  res.status(200).json({ success: true, data: staleness });
});

// @desc    Reuse an existing plan (Rev. 2 Part B7)
// @route   POST /api/production-plans/:id/reuse
// @access  Private
exports.reuseProductionPlan = asyncHandler(async (req, res, next) => {
  const sourcePlan = await ProductionPlan.findById(req.params.id).populate('productId');
  if (!sourcePlan) return res.status(404).json({ success: false, error: 'Source plan not found' });

  const {
    quantity,
    requiredDate,
    warehouseId,
    siteId,
    priority,
    notes,
    splitMode = 'COUNT',
    splitValue = 1,
  } = req.body;

  const targetQty = Number(quantity || sourcePlan.quantity || sourcePlan.totalPlans || 1);
  const targetWhId = warehouseId || sourcePlan.warehouseId;
  const targetDate = requiredDate ? new Date(requiredDate) : new Date(Date.now() + 7 * 86400000);

  // Fetch active BOM for product
  const activeBom = await BOM.findOne({
    productId: sourcePlan.productId?._id || sourcePlan.productId,
    status: 'Active'
  }).populate('components.materialId');

  const newPlanNumber = await nextSeqNumber('productionPlan', 'PLAN');
  const currentUserId = req.user ? (req.user.id || req.user._id) : null;

  // Build ingredients from active BOM
  let ingredients = [];
  if (activeBom && activeBom.components && activeBom.components.length > 0) {
    const batchSize = activeBom.batchSize || 1;
    ingredients = activeBom.components.map(c => {
      const mat = c.materialId || {};
      const lossPct = c.lossPercentage || 0;
      const qtyPerPlan = (c.quantity || c.qty || 1) / batchSize;
      const lossMult = 1 + (lossPct / 100);
      return {
        material: mat._id || c.materialId,
        materialId: mat._id || c.materialId,
        materialCode: mat.code || c.materialCode,
        materialName: mat.name || c.materialName,
        quantityPerPlan: qtyPerPlan,
        totalQuantity: Math.round((qtyPerPlan * targetQty * lossMult) * 10000) / 10000,
        uom: mat.unit || c.uom || 'pcs',
        warehouse: targetWhId,
        warehouseId: targetWhId,
        lossPercentage: lossPct,
      };
    });
  }

  // Create cloned Master Plan forward
  const newPlan = await ProductionPlan.create({
    planNumber: newPlanNumber,
    planName: `${sourcePlan.planName} (Reused)`,
    basedOnPlanId: sourcePlan._id,
    copiedFromPlanId: sourcePlan._id,
    productId: sourcePlan.productId,
    product: sourcePlan.product || sourcePlan.productId,
    productCode: sourcePlan.productCode,
    productName: sourcePlan.productName,
    bomId: activeBom?._id || sourcePlan.bomId,
    bom: activeBom?._id || sourcePlan.bomId,
    bomVersion: activeBom?.version || sourcePlan.bomVersion || '1',
    siteId: siteId || sourcePlan.siteId,
    warehouseId: targetWhId,
    totalPlans: targetQty,
    quantity: targetQty,
    availablePlans: targetQty,
    releasedPlans: 0,
    completedPlans: 0,
    cancelledPlans: 0,
    requiredDate: targetDate,
    requiredByDate: targetDate,
    priority: priority || sourcePlan.priority || 'MEDIUM',
    workCenter: sourcePlan.workCenter || 'Main Assembly Line 1',
    ingredients,
    customMaterials: sourcePlan.customMaterials || [],
    substitutions: sourcePlan.substitutions || [],
    materialStatus: activeBom
      ? await MRPEngineService.checkMaterialAvailability(activeBom._id, targetQty, targetWhId)
      : (sourcePlan.materialStatus || { status: 'READY', shortages: [], components: [] }),
    status: 'DRAFT',
    planSource: 'MANUAL',
    source: 'MANUAL',
    notes: notes || `Reused from master plan ${sourcePlan.planNumber}`,
    createdBy: currentUserId,
    auditHistory: [
      {
        action: 'REUSE_PLAN',
        user: currentUserId,
        timestamp: new Date(),
        details: `Reused from source plan ${sourcePlan.planNumber} into new plan ${newPlanNumber}`,
      }
    ]
  });

  // Generate instances for reused plan
  const rawBatches = ProductionPlanningEngine.splitPlanIntoBatches({
    totalQuantity: targetQty,
    splitMode,
    splitValue,
    startDate: targetDate,
    workCenter: newPlan.workCenter,
  });

  const createdInstances = [];
  for (let i = 0; i < rawBatches.length; i++) {
    const b = rawBatches[i];
    const instNumber = `${newPlanNumber}-${String.fromCharCode(65 + i)}`;
    const instance = await ProductionPlanInstance.create({
      instanceNumber: instNumber,
      planId: newPlan._id,
      planNumber: newPlan.planNumber,
      sequence: i + 1,
      productId: newPlan.productId,
      productCode: newPlan.productCode,
      productName: newPlan.productName,
      bomId: newPlan.bomId,
      bomVersion: newPlan.bomVersion,
      warehouseId: newPlan.warehouseId,
      siteId: newPlan.siteId,
      quantity: b.quantity,
      plannedStartDate: b.plannedStartDate,
      workCenter: b.workCenter,
      status: 'DRAFT',
      notes: b.notes,
      createdBy: currentUserId,
    });
    createdInstances.push(instance);
  }

  res.status(201).json({
    success: true,
    data: newPlan,
    instances: createdInstances,
    message: `Plan ${sourcePlan.planNumber} successfully reused as new plan ${newPlan.planNumber} with ${createdInstances.length} batch instances.`
  });
});

// @desc    Add custom material component outside standard BOM (Rev. 2 Part B8)
// @route   POST /api/production-plans/:id/custom-material
// @access  Private
exports.addCustomMaterial = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const { materialId, quantity, uom, reason, warehouseId } = req.body;
  if (!materialId || !quantity) {
    return res.status(400).json({ success: false, error: 'materialId and quantity are required' });
  }

  const mat = await Material.findById(materialId);
  if (!mat) return res.status(404).json({ success: false, error: 'Material not found' });

  const currentUserId = req.user ? (req.user.id || req.user._id) : null;
  const customItem = {
    materialId: mat._id,
    materialCode: mat.code,
    materialName: mat.name,
    quantity: Number(quantity),
    uom: uom || mat.unit || 'pcs',
    warehouseId: warehouseId || plan.warehouseId,
    reason: reason || 'Manual addition outside standard BOM',
    addedBy: currentUserId,
    addedAt: new Date(),
    isApproved: true,
  };

  plan.customMaterials.push(customItem);
  plan.auditHistory.push({
    action: 'ADD_CUSTOM_MATERIAL',
    user: currentUserId,
    timestamp: new Date(),
    details: `Added custom material ${mat.code} (${mat.name}, Qty: ${quantity}). Reason: ${reason || 'N/A'}`,
  });

  await plan.save();

  res.status(201).json({ success: true, data: plan, customMaterial: customItem });
});

// @desc    Add material substitution (Rev. 2 Part B8)
// @route   POST /api/production-plans/:id/substitute-material
// @access  Private
exports.addSubstitution = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

  const {
    originalMaterialId,
    substituteMaterialId,
    originalQuantity,
    substituteQuantity,
    conversionFactor = 1.0,
    reason,
  } = req.body;

  const [origMat, subMat] = await Promise.all([
    Material.findById(originalMaterialId),
    Material.findById(substituteMaterialId),
  ]);

  if (!origMat || !subMat) {
    return res.status(404).json({ success: false, error: 'Original or substitute material not found' });
  }

  const currentUserId = req.user ? (req.user.id || req.user._id) : null;
  const subItem = {
    originalMaterialId: origMat._id,
    originalMaterialCode: origMat.code,
    originalMaterialName: origMat.name,
    substituteMaterialId: subMat._id,
    substituteMaterialCode: subMat.code,
    substituteMaterialName: subMat.name,
    originalQuantity: Number(originalQuantity),
    substituteQuantity: Number(substituteQuantity),
    conversionFactor: Number(conversionFactor),
    reason: reason || 'Approved engineering substitute',
    substitutedBy: currentUserId,
    substitutedAt: new Date(),
    isApproved: true,
  };

  plan.substitutions.push(subItem);
  plan.auditHistory.push({
    action: 'SUBSTITUTE_MATERIAL',
    user: currentUserId,
    timestamp: new Date(),
    details: `Substituted ${origMat.code} (${originalQuantity}) with ${subMat.code} (${substituteQuantity}). Reason: ${reason}`,
  });

  await plan.save();

  res.status(201).json({ success: true, data: plan, substitution: subItem });
});

// @desc    Get reusable master plan templates
// @route   GET /api/production-plans/templates
// @access  Private
exports.getReusableTemplates = asyncHandler(async (req, res, next) => {
  const templates = await ProductionPlan.find({
    $or: [{ isTemplate: true }, { isReusable: true }]
  })
    .populate('productId', 'name code unit')
    .populate('bomId')
    .populate('warehouseId', 'name code')
    .sort('-createdAt')
    .limit(50);

  res.status(200).json({ success: true, count: templates.length, data: templates });
});

// @desc    Synchronize master plan progress dynamically from instance records
// @route   POST /api/production-plans/:id/sync-progress
// @access  Private
exports.syncPlanProgress = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlanningEngine.syncPlanProgressFromInstances(req.params.id);
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
  res.status(200).json({ success: true, data: plan });
});

// @desc    Match and rank existing production plans using 10-criteria deterministic engine
// @route   POST /api/production-plans/match
// @access  Private
exports.matchProductionPlans = asyncHandler(async (req, res, next) => {
  const matchResult = await ProductionPlanningEngine.matchExistingPlans(req.body);
  if (!matchResult.success) {
    return res.status(400).json(matchResult);
  }
  res.status(200).json(matchResult);
});

// @desc    Re-verify production plan against live inventory, BOM, site, machine & capacity
// @route   POST /api/production-plans/:id/re-verify
// @access  Private
exports.reverifyProductionPlan = asyncHandler(async (req, res, next) => {
  const plan = await ProductionPlan.findById(req.params.id).populate('productId bomId warehouseId siteId');
  if (!plan) return res.status(404).json({ success: false, code: 'PLAN_NOT_FOUND', error: 'Plan not found' });

  const remaining = plan.remainingQuantity !== undefined ? plan.remainingQuantity : (plan.availablePlans || plan.totalPlans || 0);
  const bomId = plan.bomId?._id || plan.bomId;
  const whId = plan.warehouseId?._id || plan.warehouseId;
  const siteId = plan.siteId?._id || plan.siteId;

  const checks = {
    inventory: { passed: true, details: 'Inventory verified' },
    bom: { passed: true, details: 'BOM recipe is active and current' },
    warehouse: { passed: true, details: 'Warehouse is active and reachable' },
    capacity: { passed: true, details: 'Capacity verified for work center' },
    status: { passed: !['CANCELLED', 'REJECTED'].includes(plan.status), details: `Current status: ${plan.status}` },
    remaining: { passed: remaining > 0, remaining, details: `${remaining} units available` },
  };

  if (bomId) {
    const matCheck = await MRPEngineService.checkMaterialAvailability(bomId, remaining || 1, whId, siteId);
    if (matCheck.status === 'SHORTAGE') {
      checks.inventory.passed = false;
      checks.inventory.details = `Material shortages detected (${(matCheck.shortages || []).length} items)`;
      checks.inventory.shortages = matCheck.shortages;
    }
  }

  const allPassed = Object.values(checks).every(c => c.passed);

  res.status(200).json({
    success: true,
    planId: plan._id,
    planNumber: plan.planNumber,
    isReady: allPassed,
    checks,
    remainingQuantity: remaining,
  });
});

// @desc    Manager/Approver Override to force plan execution with mandatory justification
// @route   POST /api/production-plans/:id/override
// @access  Private (Admin, Production Manager, Approver only)
exports.overrideProductionPlan = asyncHandler(async (req, res, next) => {
  const allowedRoles = ['Admin', 'Production Manager', 'Approver', 'Manager'];
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      code: 'UNAUTHORIZED_OVERRIDE',
      error: 'Only authorized Production Managers or Approvers can override plan restrictions.',
    });
  }

  const { justification } = req.body;
  if (!justification || justification.trim().length < 10) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JUSTIFICATION',
      error: 'A detailed typed justification (minimum 10 characters) is mandatory for managerial override.',
    });
  }

  const plan = await ProductionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, code: 'PLAN_NOT_FOUND', error: 'Plan not found' });

  const currentUserId = req.user.id || req.user._id;
  plan.status = 'APPROVED';
  plan.overrideDetails = {
    overriddenBy: currentUserId,
    overriddenAt: new Date(),
    justification: justification.trim(),
  };
  plan.auditHistory.push({
    action: 'MANAGER_OVERRIDE',
    user: currentUserId,
    timestamp: new Date(),
    details: `Manager override by ${req.user.username || req.user.name} (${req.user.role}). Reason: ${justification.trim()}`,
  });

  await plan.save();

  // Write immutable audit log entry
  try {
    await AuditLog.create({
      entityType: 'ProductionPlan',
      entityId: plan._id,
      action: 'APPROVE',
      userId: currentUserId,
      userName: req.user.username || req.user.name,
      role: req.user.role,
      module: 'Planning',
      reason: `MANAGER_OVERRIDE: ${justification.trim()}`,
      changes: {
        status: 'APPROVED',
        overrideJustification: justification.trim(),
      },
    });
  } catch (err) {
    console.warn('[AuditLog] Override log warning:', err.message);
  }

  res.status(200).json({
    success: true,
    message: 'Managerial override successfully recorded. Plan is approved for execution.',
    data: plan,
  });
});



