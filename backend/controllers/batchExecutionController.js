const mongoose = require('mongoose');
const ProductionOrder = require('../models/ProductionOrder');
const ProductionPlan = require('../models/ProductionPlan');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const MPN = require('../models/MPN');
const Warehouse = require('../models/Warehouse');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const asyncHandler = require('../middleware/asyncHandler');

const VARIANCE_TOLERANCE_PCT = 5.0;

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
  const anyWh = await Warehouse.findOne({ status: 'Active' });
  return anyWh ? anyWh._id : null;
}

// @desc    Execute Batch Entry with 5% Variance Gate (Section 7, 8 & Blueprint Sheet 1)
// @route   POST /api/batches/execute
// @access  Private
exports.executeBatch = asyncHandler(async (req, res) => {
  const {
    source = 'Plan',
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

  let effectiveProductId = productId;
  let bomDoc = null;
  if (bomId) {
    bomDoc = await BOM.findById(bomId).lean();
    if (!effectiveProductId && bomDoc) {
      effectiveProductId = bomDoc.productId?._id || bomDoc.productId;
    }
  }
  if (!effectiveProductId && planId) {
    const planDoc = await ProductionPlan.findById(planId).lean();
    if (planDoc) {
      effectiveProductId = planDoc.productId?._id || planDoc.productId;
    }
  }

  if (!effectiveProductId) {
    return res.status(400).json({ success: false, error: 'Product reference is required' });
  }

  const effectiveReason = (outputVarianceReason || varianceReason || '').trim();
  const effectiveConsumeLots = consumeLots !== undefined ? consumeLots : (consumeLotStock !== undefined ? consumeLotStock : true);
  const effectiveInputs = (inputs && inputs.length > 0) ? inputs : (materialInputs || []);

  const effectiveBatchNo = batchNumber || `BCH-${Date.now()}`;
  const numPlanOutput = parseFloat(planOutputQty) || 0;
  const numActualOutput = parseFloat(actualOutputQty) || 0;

  if (numActualOutput <= 0) {
    return res.status(400).json({ success: false, error: 'Actual output quantity must be greater than 0' });
  }

  // 1. Output Variance Calculation & 5% Gate
  let outputVarianceKg = numActualOutput - numPlanOutput;
  let outputVariancePct = numPlanOutput > 0 ? (outputVarianceKg / numPlanOutput) * 100 : 0;

  if (numPlanOutput > 0 && Math.abs(outputVariancePct) > VARIANCE_TOLERANCE_PCT) {
    if (!effectiveReason) {
      return res.status(400).json({
        success: false,
        error: `Output variance is ${outputVariancePct.toFixed(1)}%, which exceeds the ${VARIANCE_TOLERANCE_PCT}% tolerance threshold. Reason for Output Variance is required.`
      });
    }
  }

  // 2. Material Inputs Variance Verification & 5% Gate
  const validatedComponents = [];
  for (const comp of effectiveInputs) {
    const pInput = parseFloat(comp.planInputQty) || 0;
    const aInput = parseFloat(comp.actualInputQty) || 0;
    const compVarKg = aInput - pInput;
    const compVarPct = pInput > 0 ? (compVarKg / pInput) * 100 : 0;

    if (pInput > 0 && Math.abs(compVarPct) > VARIANCE_TOLERANCE_PCT) {
      if (!comp.varianceReason || !comp.varianceReason.trim()) {
        return res.status(400).json({
          success: false,
          error: `Material variance for ${comp.materialName || comp.mpnCode || comp.materialId} is ${compVarPct.toFixed(1)}%, which exceeds the ${VARIANCE_TOLERANCE_PCT}% tolerance. Reason for Variance is required.`
        });
      }
    }

    validatedComponents.push({
      materialId: comp.materialId,
      mpnId: comp.mpnId,
      expectedQuantity: pInput,
      actualQuantity: aInput,
      consumedQuantity: effectiveConsumeLots ? aInput : 0,
      varianceQuantity: compVarKg,
      varianceReason: comp.varianceReason || '',
      lotNumber: comp.lotNumber || '',
      warehouseId: comp.warehouseId || warehouseId,
      lossPercent: comp.lossPercent || 0,
    });
  }

  // Resolve warehouse
  const resolvedWhId = await resolveWarehouse(siteId, warehouseId);
  if (!resolvedWhId) {
    return res.status(400).json({ success: false, error: 'No active warehouse found for batch execution' });
  }

  // Create ProductionOrder record
  const order = await ProductionOrder.create({
    prdNumber: effectiveBatchNo,
    planId: mongoose.isValidObjectId(planId) ? planId : undefined,
    sourcePlanNumber: typeof planId === 'string' ? planId : undefined,
    productId: effectiveProductId,
    bomId: bomId || undefined,
    siteId: siteId || undefined,
    sourceWarehouseId: resolvedWhId,
    destinationWarehouseId: resolvedWhId,
    warehouseId: resolvedWhId,
    targetQuantity: numPlanOutput || numActualOutput,
    actualQuantity: numActualOutput,
    varianceReason: effectiveReason,
    batchNumber: effectiveBatchNo,
    mfgDate: mfgDate ? new Date(mfgDate) : new Date(),
    expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    status: 'Completed',
    components: validatedComponents,
    createdBy: req.user ? req.user.id : null,
    qcApprovedBy: req.user ? req.user.id : null,
    notes: batchNotes || `Source: ${source}`
  });

  // 3. Post Finished Goods Output to Inventory
  await InventoryLedgerService.recordTransaction({
    materialId: effectiveProductId,
    warehouseId: resolvedWhId,
    siteId: siteId || undefined,
    quantity: numActualOutput,
    type: 'PRODUCTION_OUTPUT',
    batchNumber: effectiveBatchNo,
    lotNumber: effectiveBatchNo,
    mfgDate: order.mfgDate,
    expiryDate: order.expiryDate,
    sourceDocType: 'ProductionOrder',
    sourceDocId: order._id.toString(),
    referenceId: effectiveBatchNo,
    reason: `Production output for batch ${effectiveBatchNo}`,
    userId: req.user ? req.user.id : null
  });

  // 4. Consume Raw Materials at Lot Level (if toggle active)
  if (consumeLotStock) {
  if (effectiveConsumeLots) {
    for (const comp of validatedComponents) {
      if (comp.consumedQuantity > 0 && comp.materialId) {
        try {
          await InventoryLedgerService.recordTransaction({
            materialId: comp.materialId,
            warehouseId: comp.warehouseId || resolvedWhId,
            siteId: siteId || undefined,
            quantity: comp.consumedQuantity,
            type: 'PRODUCTION_CONSUMPTION',
            batchNumber: comp.lotNumber || 'DEFAULT',
            lotNumber: comp.lotNumber || undefined,
            sourceDocType: 'ProductionOrder',
            sourceDocId: order._id.toString(),
            referenceId: effectiveBatchNo,
            reason: `Consumed in batch ${effectiveBatchNo} (${comp.varianceReason || 'Standard BOM'})`,
            userId: req.user ? req.user.id : null
          });
        } catch (consumeErr) {
          console.warn(`[Batch Execution] Consumption warning on material ${comp.materialId}:`, consumeErr.message);
        }
      }
    }
  }

  // If linked to a plan, update plan execution counters
  if (planId && mongoose.isValidObjectId(planId)) {
    try {
      await ProductionPlan.findByIdAndUpdate(planId, {
        $inc: { completedPlans: 1 },
        $set: { status: 'IN_PROGRESS' }
      });
    } catch (e) {}
  }

  res.status(201).json({
    success: true,
    message: `Batch ${effectiveBatchNo} successfully executed and posted to inventory!`,
    data: order
  });
});

// @desc    Dynamic IP/OP Correction — Impact overall inventory by editing IP/OP
// @route   PUT /api/batches/:id/adjust-ip-op
// @access  Private
exports.adjustDynamicIpOp = asyncHandler(async (req, res) => {
  const {
    actualOutputQty,
    outputVarianceReason,
    materialInputs = []
    adjustmentReason,
    varianceReason,
    materialInputs = [],
    inputs = []
  } = req.body;

  const effectiveInputs = inputs.length > 0 ? inputs : materialInputs;
  const effectiveReason = (outputVarianceReason || adjustmentReason || varianceReason || '').trim();

  const order = await ProductionOrder.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Batch order not found' });
  }

  const oldOutput = order.actualQuantity || 0;
  const newOutput = actualOutputQty !== undefined ? parseFloat(actualOutputQty) : oldOutput;
  const outputDelta = newOutput - oldOutput;

  // 1. If Output quantity changed, update inventory ledger
  if (outputDelta !== 0) {
    const txnType = outputDelta > 0 ? 'PRODUCTION_OUTPUT' : 'ADJUSTMENT_OUT';
    await InventoryLedgerService.recordTransaction({
      materialId: order.productId,
      warehouseId: order.destinationWarehouseId || order.sourceWarehouseId,
      siteId: order.siteId,
      quantity: Math.abs(outputDelta),
      type: txnType,
      batchNumber: order.batchNumber,
      lotNumber: order.batchNumber,
      sourceDocType: 'ProductionOrderCorrection',
      sourceDocId: order._id.toString(),
      referenceId: `CORR-${order.batchNumber}`,
      reason: `Dynamic Output correction (Delta: ${outputDelta > 0 ? '+' : ''}${outputDelta})`,
      userId: req.user ? req.user.id : null
    });
    order.actualQuantity = newOutput;
    if (outputVarianceReason) order.varianceReason = outputVarianceReason;
    if (effectiveReason) order.varianceReason = effectiveReason;
  }

  // 2. If Input quantities changed, adjust inventory ledger for each material
  for (const updatedComp of materialInputs) {
  for (const updatedComp of effectiveInputs) {
    const existingComp = order.components.find(c =>
      (c.materialId && c.materialId.toString() === updatedComp.materialId?.toString()) ||
      (c.mpnId && c.mpnId.toString() === updatedComp.mpnId?.toString())
    );

    if (existingComp && updatedComp.actualInputQty !== undefined) {
      const oldCompInput = existingComp.actualQuantity || 0;
      const newCompInput = parseFloat(updatedComp.actualInputQty) || 0;
      const compDelta = newCompInput - oldCompInput;

      if (compDelta !== 0) {
        // More consumed (positive delta) -> PRODUCTION_CONSUMPTION
        // Less consumed (negative delta) -> ADJUSTMENT_IN (return to stock)
        const txnType = compDelta > 0 ? 'PRODUCTION_CONSUMPTION' : 'ADJUSTMENT_IN';
        try {
          await InventoryLedgerService.recordTransaction({
            materialId: existingComp.materialId,
            warehouseId: existingComp.warehouseId || order.sourceWarehouseId,
            siteId: order.siteId,
            quantity: Math.abs(compDelta),
            type: txnType,
            batchNumber: updatedComp.lotNumber || existingComp.lotNumber || 'DEFAULT',
            lotNumber: updatedComp.lotNumber || existingComp.lotNumber || undefined,
            sourceDocType: 'ProductionOrderCorrection',
            sourceDocId: order._id.toString(),
            referenceId: `CORR-MAT-${order.batchNumber}`,
            reason: `Dynamic IP/OP material correction (Delta: ${compDelta > 0 ? '+' : ''}${compDelta})`,
            userId: req.user ? req.user.id : null
          });
        } catch (compErr) {
          console.warn('[Dynamic IP/OP] Component correction warning:', compErr.message);
        }

        existingComp.actualQuantity = newCompInput;
        existingComp.consumedQuantity = newCompInput;
        existingComp.varianceQuantity = newCompInput - (existingComp.expectedQuantity || 0);
        if (updatedComp.varianceReason) existingComp.varianceReason = updatedComp.varianceReason;
        if (updatedComp.lotNumber) existingComp.lotNumber = updatedComp.lotNumber;
      }
    }
  }

  order.updatedAt = new Date();
  await order.save();

  res.status(200).json({
    success: true,
    message: `Dynamic IP/OP correction applied to batch ${order.batchNumber}! Inventory ledger adjusted.`,
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
