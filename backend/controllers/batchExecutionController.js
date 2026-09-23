const mongoose = require('mongoose');
const ProductionOrder = require('../models/ProductionOrder');
const ProductionPlan = require('../models/ProductionPlan');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const MPN = require('../models/MPN');
const Warehouse = require('../models/Warehouse');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const asyncHandler = require('../middleware/asyncHandler');

const InventoryItem = require('../models/InventoryItem');

// Global variance tolerance (%). Configurable via env; defaults to 5.0 per spec.
const getVarianceTolerance = () => {
  const v = parseFloat(process.env.VARIANCE_TOLERANCE_PCT);
  return Number.isFinite(v) && v >= 0 ? v : 5.0;
};
// Roles allowed to submit a batch whose variance exceeds tolerance without a reason
const VARIANCE_OVERRIDE_ROLES = ['Admin', 'Manager', 'Production Manager'];

const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Helper to auto-resolve default warehouse from site
 */
async function resolveWarehouse(siteId, preferredWhId) {
  if (preferredWhId) return preferredWhId;
  if (siteId) {
    const defWh = await Warehouse.findOne({ siteId, isDefault: true, status: 'Active' })
      || await Warehouse.findOne({ siteId, status: 'Active' });
    if (defWh) return defWh._id;
  }
  return null;
}

/**
 * Find a specific lot row for material + warehouse + lot.
 */
async function findLot(materialId, warehouseId, lotNumber) {
  return InventoryItem.findOne({
    materialId,
    warehouseId,
    $or: [{ lotNumber }, { batchNumber: lotNumber }]
  }).lean();
}

/**
 * Run a list of ledger postings; if any fails, reverse the ones already posted
 * so the Centralized Inventory never ends up partially updated.
 */
async function postAllOrNothing(postings, reversalRef) {
  const done = [];
  try {
    for (const p of postings) {
      await InventoryLedgerService.recordTransaction(p);
      done.push(p);
    }
  } catch (err) {
    for (const p of done.reverse()) {
      const isOut = ['PRODUCTION_CONSUMPTION', 'ADJUSTMENT_OUT', 'Issue'].includes(p.type);
      try {
        await InventoryLedgerService.recordTransaction({
          ...p,
          type: isOut ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          sourceDocType: 'BatchReversal',
          referenceId: reversalRef,
          reason: `Automatic reversal (batch failed): ${err.message}`,
        });
      } catch (revErr) {
        console.error('[Batch Execution] CRITICAL: reversal failed', revErr.message);
      }
    }
    throw err;
  }
}

/**
 * Recalculate a plan's executed / remaining quantities from its executed batches.
 */
async function refreshPlanProgress(planId) {
  if (!planId || !mongoose.isValidObjectId(planId)) return;
  const plan = await ProductionPlan.findById(planId);
  if (!plan) return;
  const orders = await ProductionOrder.find({ planId: plan._id, status: { $in: ['Completed', 'COMPLETED'] } }).select('actualQuantity').lean();
  const executed = orders.reduce((a, o) => a + (o.actualQuantity || 0), 0);
  const target = plan.quantity || 0;
  plan.executedQuantity = round4(executed);
  plan.completedPlans = orders.length;
  plan.remainingQuantity = Math.max(0, round4(target - executed));
  if (executed > 0) plan.status = plan.remainingQuantity <= 0 ? 'COMPLETED' : 'PARTIALLY_COMPLETED';
  await plan.save({ validateBeforeSave: false });
}

// @desc    Execute Batch Entry with variance gate + automatic inventory update
// @route   POST /api/batches/execute
// @access  Private
exports.executeBatch = asyncHandler(async (req, res) => {
  const {
    source: rawSource,
    sourceType,
    planId,
    productId,
    bomId,
    batchNumber,
    mfgDate,
    expiryDate,
    executedBy,
    planOutputQty,
    actualOutputQty,
    outputVarianceReason,
    varianceReason,
    consumeLotStock,
    consumeLots,
    materialInputs,
    inputs,
    batchNotes = '',
    siteId,
    warehouseId
  } = req.body;

  // Accept either source ('Plan' | 'Ad Hoc') or legacy sourceType ('PLAN' | 'ADHOC')
  const source = rawSource || (sourceType ? (String(sourceType).toUpperCase() === 'PLAN' ? 'Plan' : 'Ad Hoc') : (planId ? 'Plan' : 'Ad Hoc'));

  const tolerance = getVarianceTolerance();
  const canOverride = VARIANCE_OVERRIDE_ROLES.includes(req.user?.role) && req.body.overrideTolerance === true;

  let effectiveProductId = productId;
  let planDoc = null;
  if (bomId) {
    const bomDoc = await BOM.findById(bomId).lean();
    if (!effectiveProductId && bomDoc) effectiveProductId = bomDoc.productId?._id || bomDoc.productId;
  }
  if (planId && mongoose.isValidObjectId(planId)) {
    planDoc = await ProductionPlan.findById(planId).lean();
    if (!planDoc) return res.status(404).json({ success: false, error: 'Plan not found' });
    if (!effectiveProductId) effectiveProductId = planDoc.productId?._id || planDoc.productId;
  }
  if (source === 'Plan' && !planDoc) {
    return res.status(400).json({ success: false, error: 'A valid plan is required when Source is "Plan". Use Source "Ad Hoc" otherwise.' });
  }
  if (!effectiveProductId) {
    return res.status(400).json({ success: false, error: 'Product reference is required' });
  }
  const product = await Material.findById(effectiveProductId).lean();
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

  const effectiveReason = (outputVarianceReason || varianceReason || '').trim();
  const effectiveConsumeLots = consumeLots !== undefined ? consumeLots : (consumeLotStock !== undefined ? consumeLotStock : true);
  const effectiveInputs = (inputs && inputs.length > 0) ? inputs : (materialInputs || []);

  const effectiveBatchNo = (batchNumber || '').trim() || `BCH-${Date.now()}`;
  const dup = await ProductionOrder.findOne({ batchNumber: effectiveBatchNo, productId: effectiveProductId }).select('_id').lean();
  if (dup) return res.status(409).json({ success: false, error: `Batch number ${effectiveBatchNo} already exists for this product` });

  const numPlanOutput = parseFloat(planOutputQty) || 0;
  const numActualOutput = parseFloat(actualOutputQty) || 0;
  if (numActualOutput <= 0) {
    return res.status(400).json({ success: false, error: 'Actual output quantity must be greater than 0' });
  }
  if (mfgDate && expiryDate && new Date(expiryDate) <= new Date(mfgDate)) {
    return res.status(400).json({ success: false, error: 'Expiry date must be after manufacturing date' });
  }

  // 1. Output variance gate
  const outputVarianceKg = numActualOutput - numPlanOutput;
  const outputVariancePct = numPlanOutput > 0 ? (outputVarianceKg / numPlanOutput) * 100 : 0;
  if (numPlanOutput > 0 && Math.abs(outputVariancePct) > tolerance && !effectiveReason && !canOverride) {
    return res.status(400).json({
      success: false,
      error: `Output variance is ${outputVariancePct.toFixed(1)}%, which exceeds the ${tolerance}% tolerance. Reason for Output Variance is required.`
    });
  }

  // Resolve warehouse (must be explicit or derivable from the location)
  const resolvedWhId = await resolveWarehouse(siteId || planDoc?.siteId, warehouseId || planDoc?.warehouseId);
  if (!resolvedWhId) {
    return res.status(400).json({ success: false, error: 'Select a Location/Warehouse for this batch' });
  }
  const whDoc = await Warehouse.findById(resolvedWhId).lean();
  const resolvedSiteId = siteId || whDoc?.siteId || planDoc?.siteId;

  // 2. Material inputs: variance gate + lot validation (all BEFORE any stock moves)
  const validatedComponents = [];
  for (const comp of effectiveInputs) {
    const pInput = parseFloat(comp.planInputQty) || 0;
    const aInput = parseFloat(comp.actualInputQty) || 0;
    const compVarKg = aInput - pInput;
    const compVarPct = pInput > 0 ? (compVarKg / pInput) * 100 : 0;
    const label = comp.materialName || comp.mpnCode || comp.materialId;

    if (aInput < 0) return res.status(400).json({ success: false, error: `Actual input for ${label} cannot be negative` });
    if (pInput > 0 && Math.abs(compVarPct) > tolerance && !(comp.varianceReason || '').trim() && !canOverride) {
      return res.status(400).json({
        success: false,
        error: `Material variance for ${label} is ${compVarPct.toFixed(1)}%, which exceeds the ${tolerance}% tolerance. Reason for Variance is required.`
      });
    }

    const compWh = comp.warehouseId || resolvedWhId;
    if (effectiveConsumeLots && aInput > 0) {
      if (!comp.materialId) return res.status(400).json({ success: false, error: `Material reference missing for ${label}` });
      if (!comp.lotNumber) return res.status(400).json({ success: false, error: `Select a Lot No for ${label}` });
      const lot = await findLot(comp.materialId, compWh, comp.lotNumber);
      if (!lot) return res.status(400).json({ success: false, error: `Lot ${comp.lotNumber} of ${label} not found in the selected warehouse` });
      if (lot.expiryDate && new Date(lot.expiryDate) < new Date()) {
        return res.status(400).json({ success: false, error: `Lot ${comp.lotNumber} of ${label} is expired` });
      }
      if ((lot.available || 0) < aInput) {
        return res.status(400).json({ success: false, error: `Insufficient stock in lot ${comp.lotNumber} of ${label}. Available: ${lot.available || 0}, Required: ${aInput}` });
      }
    }

    validatedComponents.push({
      materialId: comp.materialId,
      mpnId: comp.mpnId,
      expectedQuantity: pInput,
      actualQuantity: aInput,
      consumedQuantity: effectiveConsumeLots ? aInput : 0,
      varianceQuantity: round4(compVarKg),
      variancePercent: round4(compVarPct),
      varianceReason: comp.varianceReason || '',
      lotNumber: comp.lotNumber || '',
      warehouseId: compWh,
      lossPercent: comp.lossPercent || 0,
    });
  }

  // Aggregate demand per lot (same lot may be listed twice)
  if (effectiveConsumeLots) {
    const perLot = {};
    for (const c of validatedComponents) {
      if (c.consumedQuantity > 0) {
        const k = `${c.materialId}|${c.warehouseId}|${c.lotNumber}`;
        perLot[k] = (perLot[k] || 0) + c.consumedQuantity;
      }
    }
    for (const [k, qty] of Object.entries(perLot)) {
      const [m, w, l] = k.split('|');
      const lot = await findLot(m, w, l);
      if (!lot || (lot.available || 0) < qty) {
        return res.status(400).json({ success: false, error: `Insufficient combined stock in lot ${l}. Available: ${lot?.available || 0}, Required: ${qty}` });
      }
    }
  }

  // 3. Build all postings, then apply all-or-nothing
  const orderId = new mongoose.Types.ObjectId();
  const effMfg = mfgDate ? new Date(mfgDate) : new Date();
  const effExp = expiryDate ? new Date(expiryDate) : null;
  const userId = req.user ? req.user.id : null;

  const postings = [];
  if (effectiveConsumeLots) {
    for (const comp of validatedComponents) {
      if (comp.consumedQuantity > 0) {
        postings.push({
          materialId: comp.materialId,
          warehouseId: comp.warehouseId,
          siteId: resolvedSiteId || undefined,
          quantity: comp.consumedQuantity,
          type: 'PRODUCTION_CONSUMPTION',
          lotNumber: comp.lotNumber,
          batchNumber: comp.lotNumber,
          sourceDocType: 'ProductionOrder',
          sourceDocId: orderId.toString(),
          referenceId: effectiveBatchNo,
          reason: `Consumed in batch ${effectiveBatchNo}${comp.varianceReason ? ` (${comp.varianceReason})` : ''}`,
          userId
        });
      }
    }
  }
  postings.push({
    materialId: effectiveProductId,
    warehouseId: resolvedWhId,
    siteId: resolvedSiteId || undefined,
    quantity: numActualOutput,
    type: 'PRODUCTION_OUTPUT',
    batchNumber: effectiveBatchNo,
    lotNumber: effectiveBatchNo,
    mfgDate: effMfg,
    expiryDate: effExp || undefined,
    sourceDocType: 'ProductionOrder',
    sourceDocId: orderId.toString(),
    referenceId: effectiveBatchNo,
    reason: `Production output for batch ${effectiveBatchNo}`,
    userId
  });

  await postAllOrNothing(postings, `REV-${effectiveBatchNo}`);

  let order;
  try {
    order = await ProductionOrder.create({
      _id: orderId,
      prdNumber: effectiveBatchNo,
      planId: planDoc ? planDoc._id : undefined,
      sourcePlanNumber: planDoc ? planDoc.planNumber : undefined,
      source: planDoc ? 'Plan' : 'Ad Hoc',
      executedBy: executedBy || req.user?.name || req.user?.username || '',
      productId: effectiveProductId,
      bomId: bomId || planDoc?.bomId || undefined,
      siteId: resolvedSiteId || undefined,
      sourceWarehouseId: resolvedWhId,
      destinationWarehouseId: resolvedWhId,
      warehouseId: resolvedWhId,
      targetQuantity: numPlanOutput || numActualOutput,
      planOutputQty: numPlanOutput,
      actualQuantity: numActualOutput,
      outputVarianceQty: round4(outputVarianceKg),
      outputVariancePercent: round4(outputVariancePct),
      varianceReason: effectiveReason,
      batchNumber: effectiveBatchNo,
      lotNumber: effectiveBatchNo,
      mfgDate: effMfg,
      expiryDate: effExp || undefined,
      status: 'Completed',
      components: validatedComponents,
      createdBy: userId,
      qcApprovedBy: userId,
      notes: batchNotes || `Source: ${planDoc ? 'Plan' : 'Ad Hoc'}`
    });
  } catch (createErr) {
    // Record could not be saved -> reverse all stock movements
    for (const p of postings.slice().reverse()) {
      const isOut = p.type === 'PRODUCTION_CONSUMPTION';
      await InventoryLedgerService.recordTransaction({
        ...p,
        type: isOut ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        sourceDocType: 'BatchReversal',
        referenceId: `REV-${effectiveBatchNo}`,
        reason: `Automatic reversal (batch record failed): ${createErr.message}`,
      }).catch(e => console.error('[Batch Execution] CRITICAL: reversal failed', e.message));
    }
    throw createErr;
  }

  if (planDoc) await refreshPlanProgress(planDoc._id);

  res.status(201).json({
    success: true,
    message: `Batch ${effectiveBatchNo} executed and posted to inventory.`,
    data: order
  });
});

// @desc    Edit IP/OP of an executed batch — posts only the delta to inventory
// @route   PUT /api/batches/:id/adjust-ip-op
// @access  Private
exports.adjustDynamicIpOp = asyncHandler(async (req, res) => {
  const {
    actualOutputQty,
    outputVarianceReason,
    adjustmentReason,
    varianceReason,
    materialInputs = [],
    inputs = []
  } = req.body;

  const tolerance = getVarianceTolerance();
  const effectiveInputs = inputs.length > 0 ? inputs : materialInputs;
  const effectiveReason = (outputVarianceReason || adjustmentReason || varianceReason || '').trim();

  const order = await ProductionOrder.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Batch order not found' });
  }

  const userId = req.user ? req.user.id : null;
  const outputWh = order.destinationWarehouseId || order.sourceWarehouseId;
  const postings = [];

  // 1. Output delta
  const oldOutput = order.actualQuantity || 0;
  const newOutput = actualOutputQty !== undefined ? parseFloat(actualOutputQty) : oldOutput;
  if (!(newOutput > 0)) return res.status(400).json({ success: false, error: 'Actual output must be greater than 0' });
  const outputDelta = round4(newOutput - oldOutput);
  if (outputDelta !== 0) {
    const plan = order.planOutputQty || order.targetQuantity || 0;
    const pct = plan > 0 ? ((newOutput - plan) / plan) * 100 : 0;
    if (plan > 0 && Math.abs(pct) > tolerance && !effectiveReason) {
      return res.status(400).json({ success: false, error: `Output variance is ${pct.toFixed(1)}% (> ${tolerance}%). Reason is required.` });
    }
    postings.push({
      materialId: order.productId,
      warehouseId: outputWh,
      siteId: order.siteId,
      quantity: Math.abs(outputDelta),
      type: outputDelta > 0 ? 'PRODUCTION_OUTPUT' : 'ADJUSTMENT_OUT',
      batchNumber: order.batchNumber,
      lotNumber: order.batchNumber,
      sourceDocType: 'ProductionOrderCorrection',
      sourceDocId: order._id.toString(),
      referenceId: `CORR-${order.batchNumber}`,
      reason: `Batch output correction (${outputDelta > 0 ? '+' : ''}${outputDelta})${effectiveReason ? `: ${effectiveReason}` : ''}`,
      userId
    });
  }

  // 2. Input deltas
  const compUpdates = [];
  for (const updatedComp of effectiveInputs) {
    const existingComp = order.components.find(c =>
      (c.materialId && c.materialId.toString() === updatedComp.materialId?.toString()) ||
      (c.mpnId && c.mpnId.toString() === updatedComp.mpnId?.toString())
    );
    if (!existingComp || updatedComp.actualInputQty === undefined) continue;

    const oldCompInput = existingComp.actualQuantity || 0;
    const newCompInput = parseFloat(updatedComp.actualInputQty) || 0;
    if (newCompInput < 0) return res.status(400).json({ success: false, error: 'Input quantity cannot be negative' });
    const compDelta = round4(newCompInput - oldCompInput);
    if (compDelta === 0) continue;

    const pInput = existingComp.expectedQuantity || 0;
    const pct = pInput > 0 ? ((newCompInput - pInput) / pInput) * 100 : 0;
    const reason = (updatedComp.varianceReason || existingComp.varianceReason || '').trim();
    if (pInput > 0 && Math.abs(pct) > tolerance && !reason) {
      return res.status(400).json({ success: false, error: `Material variance is ${pct.toFixed(1)}% (> ${tolerance}%). Reason is required.` });
    }

    const lotNo = existingComp.lotNumber || updatedComp.lotNumber;
    if (!lotNo) return res.status(400).json({ success: false, error: 'Original lot not recorded for this material; cannot adjust' });

    postings.push({
      materialId: existingComp.materialId,
      warehouseId: existingComp.warehouseId || order.sourceWarehouseId,
      siteId: order.siteId,
      quantity: Math.abs(compDelta),
      // More consumed -> consume more from same lot; less consumed -> return to same lot
      type: compDelta > 0 ? 'PRODUCTION_CONSUMPTION' : 'ADJUSTMENT_IN',
      batchNumber: lotNo,
      lotNumber: lotNo,
      sourceDocType: 'ProductionOrderCorrection',
      sourceDocId: order._id.toString(),
      referenceId: `CORR-MAT-${order.batchNumber}`,
      reason: `Batch input correction (${compDelta > 0 ? '+' : ''}${compDelta})${reason ? `: ${reason}` : ''}`,
      userId
    });
    compUpdates.push({ existingComp, newCompInput, reason, pct });
  }

  if (postings.length === 0) {
    return res.status(200).json({ success: true, message: 'No changes to apply', data: order });
  }

  await postAllOrNothing(postings, `REV-CORR-${order.batchNumber}`);

  if (outputDelta !== 0) {
    order.actualQuantity = newOutput;
    const plan = order.planOutputQty || order.targetQuantity || 0;
    order.outputVarianceQty = round4(newOutput - plan);
    order.outputVariancePercent = plan > 0 ? round4(((newOutput - plan) / plan) * 100) : 0;
    if (effectiveReason) order.varianceReason = effectiveReason;
  }
  for (const u of compUpdates) {
    u.existingComp.actualQuantity = u.newCompInput;
    u.existingComp.consumedQuantity = u.newCompInput;
    u.existingComp.varianceQuantity = round4(u.newCompInput - (u.existingComp.expectedQuantity || 0));
    u.existingComp.variancePercent = round4(u.pct);
    if (u.reason) u.existingComp.varianceReason = u.reason;
  }
  order.updatedBy = userId;
  await order.save();

  if (order.planId) await refreshPlanProgress(order.planId);

  res.status(200).json({
    success: true,
    message: `Batch ${order.batchNumber} corrected. Inventory adjusted by delta.`,
    data: order
  });
});

// @desc    Get all executed batches
// @route   GET /api/batches
// @access  Private
exports.getBatches = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.productId) query.productId = req.query.productId;
  if (req.query.batchNumber) query.batchNumber = { $regex: new RegExp(req.query.batchNumber, 'i') };

  const batches = await ProductionOrder.find(query)
    .populate('productId', 'name code unit')
    .populate('bomId', 'bomNumber version batchSize batchUOM')
    .populate('siteId', 'name code')
    .populate('sourceWarehouseId', 'name code')
    .populate('components.materialId', 'name code unit')
    .populate('components.mpnId', 'mpnCode manufacturerPartNumber manufacturerName')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: batches.length,
    data: batches
  });
});

// @desc    Get single batch by ID
// @route   GET /api/batches/:id
// @access  Private
exports.getBatchById = asyncHandler(async (req, res) => {
  const batch = await ProductionOrder.findById(req.params.id)
    .populate('productId', 'name code unit')
    .populate('bomId', 'bomNumber version batchSize batchUOM')
    .populate('siteId', 'name code')
    .populate('sourceWarehouseId', 'name code')
    .populate('components.materialId', 'name code unit')
    .populate('components.mpnId', 'mpnCode manufacturerPartNumber manufacturerName')
    .lean();

  if (!batch) {
    return res.status(404).json({ success: false, error: 'Batch not found' });
  }

  res.status(200).json({ success: true, data: batch });
});
