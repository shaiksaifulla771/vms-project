const StockAdjustment = require('../models/StockAdjustment');
const InventoryItem = require('../models/InventoryItem');
const Material = require('../models/Material');
const Sequence = require('../models/Sequence');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get all stock adjustment requests
// @route   GET /api/inventory/adjustments
// @access  Private
exports.getAdjustments = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.warehouseId) query.warehouseId = req.query.warehouseId;
  if (req.query.materialId) query.materialId = req.query.materialId;

  const adjustments = await StockAdjustment.find(query)
    .populate('materialId', 'name code unit type')
    .populate('siteId', 'name code')
    .populate('warehouseId', 'name code')
    .populate('createdBy', 'username email')
    .populate('approvedBy', 'username email')
    .populate('rejectedBy', 'username email')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: adjustments.length, data: adjustments });
});

// @desc    Create manual stock adjustment request (Pending Approval)
// @route   POST /api/inventory/adjustments
// @access  Private
exports.createAdjustmentRequest = asyncHandler(async (req, res) => {
  const { siteId, warehouseId, materialId, batchNumber, adjustmentType, quantity, reason, description, referenceDoc } = req.body;

  if (!warehouseId || !materialId || !adjustmentType || !quantity || !reason) {
    return res.status(400).json({
      success: false,
      error: 'Please provide warehouseId, materialId, adjustmentType (IN/OUT), quantity, and reason'
    });
  }

  const adjQty = parseFloat(quantity);
  if (isNaN(adjQty) || adjQty <= 0) {
    return res.status(400).json({ success: false, error: 'Adjustment quantity must be greater than zero' });
  }

  const material = await Material.findById(materialId);
  if (!material) {
    return res.status(404).json({ success: false, error: 'Material not found' });
  }

  // Get current stock to compute projected before/after qty
  const stockItem = await InventoryItem.findOne({
    materialId,
    warehouseId,
    batchNumber: batchNumber || 'DEFAULT'
  });

  const beforeQty = stockItem ? stockItem.balance : 0;
  let afterQty = beforeQty;
  if (adjustmentType === 'IN') {
    afterQty = beforeQty + adjQty;
  } else {
    afterQty = beforeQty - adjQty;
    if (afterQty < 0) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock for adjustment OUT. Current balance: ${beforeQty} ${material.unit}. Adjustment: ${adjQty} ${material.unit}`
      });
    }
  }

  let seqDoc = await Sequence.findById('stockAdjustment');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'stockAdjustment', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('stockAdjustment', { $inc: { seq: 1 } }, { new: true });
  }
  const adjNumber = `ADJ-${seqDoc.seq}`;

  const isAdmin = req.user && req.user.role === 'Admin';

  const adjustment = await StockAdjustment.create({
    adjNumber,
    siteId,
    warehouseId,
    materialId,
    batchNumber: batchNumber || 'DEFAULT',
    adjustmentType,
    quantity: adjQty,
    reason,
    description: description || '',
    referenceDoc: referenceDoc || '',
    status: isAdmin ? 'Approved' : 'Pending Approval',
    approvedBy: isAdmin ? req.user.id : null,
    approvedAt: isAdmin ? new Date() : null,
    beforeQty,
    afterQty,
    createdBy: req.user ? req.user.id : null,
  });

  if (isAdmin) {
    const txnType = adjustmentType === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    await InventoryLedgerService.recordTransaction({
      siteId: siteId || null,
      warehouseId,
      materialId,
      batchNumber: batchNumber || 'DEFAULT',
      type: txnType,
      quantity: adjQty,
      referenceDocument: 'StockAdjustment',
      referenceId: adjustment._id,
      userId: req.user.id,
      description: `Admin auto-approved adjustment: ${reason}`
    });
  }

  res.status(201).json({
    success: true,
    message: isAdmin ? `Stock adjustment ${adjNumber} approved & inventory ledger updated` : `Stock adjustment request ${adjNumber} submitted for approval`,
    data: adjustment
  });
});

// @desc    Approve stock adjustment request & execute physical ledger change
// @route   POST /api/inventory/adjustments/:id/approve
// @access  Private (Manager/Admin)
exports.approveAdjustment = asyncHandler(async (req, res) => {
  const adjustment = await StockAdjustment.findById(req.params.id);
  if (!adjustment) {
    return res.status(404).json({ success: false, error: 'Stock adjustment request not found' });
  }

  if (adjustment.status !== 'Pending Approval') {
    return res.status(400).json({ success: false, error: `Adjustment in state ${adjustment.status} cannot be approved` });
  }

  // Prevent self-approval if user is the same creator (separation of duties) unless admin override
  if (req.user && adjustment.createdBy && req.user.id === adjustment.createdBy.toString() && req.user.role !== 'Admin') {
    return res.status(403).json({ success: false, error: 'Separation of duties constraint: Created By and Approved By must be different users' });
  }

  const txnType = adjustment.adjustmentType === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

  // Execute actual immutable inventory transaction with audit trail
  const txResult = await InventoryLedgerService.recordTransaction({
    materialId: adjustment.materialId,
    warehouseId: adjustment.warehouseId,
    batchNumber: adjustment.batchNumber,
    quantity: adjustment.quantity,
    type: txnType,
    referenceId: adjustment.adjNumber,
    sourceDocType: 'StockAdjustment',
    sourceDocId: adjustment._id.toString(),
    reason: `[APPROVED] ${adjustment.reason}`,
    description: adjustment.description,
    userId: adjustment.createdBy,
    approvedBy: req.user ? req.user.id : null,
  });

  adjustment.status = 'Approved';
  adjustment.approvedBy = req.user ? req.user.id : null;
  adjustment.approvedAt = Date.now();
  if (txResult && txResult.transaction) {
    adjustment.beforeQty = txResult.transaction.beforeQty;
    adjustment.afterQty = txResult.transaction.afterQty;
  }
  await adjustment.save();

  res.status(200).json({
    success: true,
    message: `Stock adjustment ${adjustment.adjNumber} approved and ledger updated`,
    data: adjustment,
    transaction: txResult
  });
});

// @desc    Reject stock adjustment request
// @route   POST /api/inventory/adjustments/:id/reject
// @access  Private (Manager/Admin)
exports.rejectAdjustment = asyncHandler(async (req, res) => {
  const adjustment = await StockAdjustment.findById(req.params.id);
  if (!adjustment) {
    return res.status(404).json({ success: false, error: 'Stock adjustment request not found' });
  }

  if (adjustment.status !== 'Pending Approval') {
    return res.status(400).json({ success: false, error: `Adjustment in state ${adjustment.status} cannot be rejected` });
  }

  adjustment.status = 'Rejected';
  adjustment.rejectedBy = req.user ? req.user.id : null;
  adjustment.rejectedAt = Date.now();
  adjustment.rejectionReason = req.body.rejectionReason || 'Rejected during review';
  await adjustment.save();

  res.status(200).json({
    success: true,
    message: `Stock adjustment ${adjustment.adjNumber} rejected`,
    data: adjustment
  });
});
