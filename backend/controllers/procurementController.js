const PurchaseRequirement = require('../models/PurchaseRequirement');
const PurchaseRequest = require('../models/PurchaseRequest');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const Sequence = require('../models/Sequence');
const asyncHandler = require('../middleware/asyncHandler');
const ProcurementAutomationService = require('../services/procurementAutomationService');

// @desc    Get all Purchase Requirements (from MRP and manual reorders)
// @route   GET /api/procurement/requirements
// @access  Private
exports.getPurchaseRequirements = asyncHandler(async (req, res) => {
  const { status, warehouseId, siteId, search } = req.query;
  const filter = {};

  if (status && status !== 'ALL') {
    filter.status = status;
  }

  if (warehouseId && warehouseId !== 'ALL' && warehouseId !== 'all') {
    filter.warehouseId = warehouseId;
  }

  if (siteId && siteId !== 'ALL') {
    filter.siteId = siteId;
  }

  if (search && search.trim() !== '') {
    filter.$or = [
      { requirementNumber: { $regex: search.trim(), $options: 'i' } },
      { materialCode: { $regex: search.trim(), $options: 'i' } },
      { materialName: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const requirements = await PurchaseRequirement.find(filter)
    .populate('materialId', 'name code unit type basePrice defaultVendorId')
    .populate('suggestedVendor', 'name company email')
    .populate('warehouseId', 'name code')
    .populate('siteId', 'name code')
    .populate('convertedPurchaseOrderId', 'poNumber status totalAmount')
    .populate('createdBy', 'username email')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: requirements.length,
    data: requirements,
  });
});

// @desc    Update Purchase Requirement status (Approve / Reject / Cancel)
// @route   PATCH /api/procurement/requirements/:id/status
// @access  Private
exports.updatePurchaseRequirementStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  if (!['APPROVED', 'REJECTED', 'CANCELLED', 'OPEN'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid requirement status' });
  }

  const pr = await PurchaseRequirement.findById(req.params.id);
  if (!pr) {
    return res.status(404).json({ success: false, error: 'Purchase Requirement not found' });
  }

  if (pr.status === 'CONVERTED_TO_PO') {
    return res.status(400).json({ success: false, error: 'Requirement has already been converted to a PO and cannot be changed.' });
  }

  pr.status = status;
  if (notes) pr.notes = notes;
  pr.updatedAt = new Date();
  await pr.save();

  const populated = await PurchaseRequirement.findById(pr._id)
    .populate('materialId')
    .populate('suggestedVendor')
    .populate('warehouseId');

  res.status(200).json({
    success: true,
    message: `Purchase Requirement ${pr.requirementNumber} status updated to ${status}`,
    data: populated,
  });
});

// @desc    Bulk convert selected Purchase Requirements to Purchase Orders
// @route   POST /api/procurement/requirements/bulk-convert
// @access  Private
exports.bulkConvertRequirements = asyncHandler(async (req, res) => {
  const { requirementIds, overrideVendorId, destinationWarehouseId, siteId, expectedDeliveryDate } = req.body;

  if (!requirementIds || !Array.isArray(requirementIds) || requirementIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide an array of requirementIds to convert' });
  }

  const result = await ProcurementAutomationService.bulkConvertRequirementsToPO({
    requirementIds,
    overrideVendorId,
    destinationWarehouseId,
    siteId,
    expectedDeliveryDate,
    userId: req.user ? req.user._id : null,
    correlationId: req.correlationId,
  });

  res.status(201).json({
    success: true,
    message: `Successfully created ${result.ordersCreatedCount} Purchase Orders from ${result.requirementsConvertedCount} requirements.`,
    data: result,
  });
});

// @desc    Trigger automated reorder point evaluation
// @route   POST /api/procurement/reorder-check
// @access  Private
exports.evaluateReorders = asyncHandler(async (req, res) => {
  const { siteId, warehouseId } = req.body;

  const result = await ProcurementAutomationService.evaluateReorderPoints({
    siteId,
    warehouseId,
    triggeredBy: req.user ? req.user._id : null,
  });

  res.status(200).json({
    success: true,
    message: `Evaluated ${result.evaluatedCount} materials against reorder thresholds. Generated ${result.requirementsCreated} requirements.`,
    data: result,
  });
});

// @desc    Create Purchase Request from MRP Calculation (Procurement Flow)
// @route   POST /api/procurement/create
// @access  Private (Admin, Planner, Inventory Manager, ProcurementManager)
exports.createPurchaseRequestFromMRP = asyncHandler(async (req, res) => {
  const { mrpData, mrpRunId } = req.body;

  // Extract materials & shortage status
  let materials = mrpData?.materials || [];
  let hasShortage = mrpData?.hasShortage;

  let mrpRunDoc = null;
  if (mrpRunId) {
    mrpRunDoc = await MRPRun.findById(mrpRunId);
    if (mrpRunDoc) {
      const requirements = await PlanningRequirement.find({ mrpRunId: mrpRunDoc._id });
      if (requirements.length > 0) {
        materials = requirements.map(r => ({
          materialId: r.materialId,
          materialName: r.materialName,
          materialCode: r.materialCode,
          requiredQty: r.requiredQty,
          availableQty: r.availableQty,
          shortageQty: r.shortageQty,
          action: r.action,
        }));
        hasShortage = mrpRunDoc.summary?.hasShortage || materials.some(m => m.shortageQty > 0);
      }
    }
  }

  // 🔒 STRICT RULE 3: Shortage -> ONLY procurement flow. If no shortage, BLOCK PR creation.
  if (!hasShortage || !materials.some(m => m.shortageQty > 0)) {
    return res.status(400).json({
      success: false,
      error: 'No material shortage detected. Purchase Request is not required for balanced inventory.',
    });
  }

  const createdPRs = [];
  const warehouseId = mrpData?.warehouseId || mrpRunDoc?.warehouseId;

  for (const mat of materials) {
    if ((mat.shortageQty || 0) <= 0) continue;

    let seqDoc = await Sequence.findById('purchaseRequest');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'purchaseRequest', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('purchaseRequest', { $inc: { seq: 1 } }, { new: true });
    }

    const requestNumber = `PR-${seqDoc.seq}`;
    const pr = await PurchaseRequest.create({
      requestNumber,
      materialId: mat.materialId,
      quantity: mat.shortageQty,
      requiredDate: mrpData?.requiredDate || mrpRunDoc?.requiredDate || new Date(Date.now() + 7 * 86400000),
      warehouseId,
      status: 'Pending',
      requestedBy: req.user ? req.user._id : null,
      notes: `Auto-generated procurement request for shortage quantity (${mat.shortageQty} units)`,
    });

    createdPRs.push(pr);
  }

  res.status(201).json({
    success: true,
    message: `Successfully created ${createdPRs.length} Purchase Requests for material shortages.`,
    count: createdPRs.length,
    data: createdPRs,
  });
});
