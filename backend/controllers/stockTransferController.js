const StockTransfer = require('../models/StockTransfer');
const InventoryItem = require('../models/InventoryItem');
const Warehouse = require('../models/Warehouse');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const Sequence = require('../models/Sequence');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get all stock transfers with filters
// @route   GET /api/transfers
// @access  Private
exports.getStockTransfers = asyncHandler(async (req, res) => {
  const query = {};
  const andConditions = [];

  if (req.query.status) query.status = req.query.status;

  if (req.query.siteId && req.query.siteId !== 'ALL' && req.query.siteId !== '') {
    const siteWhs = await Warehouse.find({ siteId: req.query.siteId }).select('_id');
    const whIds = siteWhs.map(w => w._id);
    andConditions.push({
      $or: [
        { fromSiteId: req.query.siteId },
        { toSiteId: req.query.siteId },
        { fromWarehouseId: { $in: whIds } },
        { toWarehouseId: { $in: whIds } }
      ]
    });
  }

  if (req.query.warehouseId && req.query.warehouseId !== 'ALL' && req.query.warehouseId !== 'all') {
    andConditions.push({
      $or: [
        { fromWarehouseId: req.query.warehouseId },
        { toWarehouseId: req.query.warehouseId }
      ]
    });
  }

  if (req.query.fromWarehouseId) query.fromWarehouseId = req.query.fromWarehouseId;
  if (req.query.toWarehouseId) query.toWarehouseId = req.query.toWarehouseId;

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const transfers = await StockTransfer.find(query)
    .populate('materialId', 'name code unit type')
    .populate('fromSiteId', 'name code')
    .populate('fromWarehouseId', 'name code')
    .populate('toSiteId', 'name code')
    .populate('toWarehouseId', 'name code')
    .populate('createdBy', 'username email')
    .populate('approvedBy', 'username email')
    .populate('receivedBy', 'username email')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: transfers.length, data: transfers });
});

const mongoose = require('mongoose');

const cleanObjectId = (val) => {
  if (!val || val === '' || val === 'null' || val === 'undefined') return null;
  return mongoose.Types.ObjectId.isValid(val) ? val : null;
};

// @desc    Create stock transfer request (Pending Approval)
// @route   POST /api/transfers
// @access  Private
exports.createStockTransfer = asyncHandler(async (req, res) => {
  const { fromSiteId, fromWarehouseId, toSiteId, toWarehouseId, materialId, batchNumber, quantity, reason, notes } = req.body;

  if (!fromWarehouseId || !toWarehouseId || !materialId || !quantity || !reason) {
    return res.status(400).json({ success: false, error: 'Please select source warehouse, destination warehouse, material, transfer quantity, and reason.' });
  }

  if (fromWarehouseId.toString() === toWarehouseId.toString()) {
    return res.status(400).json({ success: false, error: 'Source and destination warehouses cannot be the same.' });
  }

  // Auto-resolve & sanitize site IDs from Warehouses if not explicitly provided
  let resolvedFromSiteId = cleanObjectId(fromSiteId);
  let resolvedToSiteId = cleanObjectId(toSiteId);

  const [fromWh, toWh] = await Promise.all([
    Warehouse.findById(fromWarehouseId),
    Warehouse.findById(toWarehouseId)
  ]);

  if (!fromWh) return res.status(400).json({ success: false, error: 'Source warehouse not found.' });
  if (!toWh) return res.status(400).json({ success: false, error: 'Destination warehouse not found.' });

  if (!resolvedFromSiteId && fromWh.siteId) resolvedFromSiteId = cleanObjectId(fromWh.siteId);
  if (!resolvedToSiteId && toWh.siteId) resolvedToSiteId = cleanObjectId(toWh.siteId);

  // Fallback: If warehouse has no siteId attached, find any active Site in system
  const Site = require('../models/Site');
  if (!resolvedFromSiteId || !resolvedToSiteId) {
    const defaultSite = await Site.findOne({ status: 'Active' }) || await Site.findOne();
    if (defaultSite) {
      if (!resolvedFromSiteId) resolvedFromSiteId = defaultSite._id;
      if (!resolvedToSiteId) resolvedToSiteId = defaultSite._id;
    }
  }

  // Calculate available stock across all batches in source warehouse
  const queryFilter = { materialId, warehouseId: fromWarehouseId };
  if (batchNumber) {
    queryFilter.batchNumber = batchNumber;
  }

  const sourceItems = await InventoryItem.find(queryFilter);
  const availableQty = sourceItems.reduce((acc, item) => {
    const onHand = Number(item.onHand !== undefined ? item.onHand : (item.balance || 0));
    const reserved = Number(item.reserved !== undefined ? item.reserved : (item.reservedBalance || 0));
    const allocated = Number(item.allocated || 0);
    const blocked = Number(item.blocked || 0);
    const itemAvail = item.available !== undefined && item.available > 0
      ? Number(item.available)
      : Math.max(0, onHand - reserved - allocated - blocked);
    return acc + Math.max(0, itemAvail);
  }, 0);

  if (availableQty < parseFloat(quantity)) {
    return res.status(400).json({
      success: false,
      error: `Insufficient stock in source warehouse (${fromWh.name}). Available: ${availableQty}, Requested: ${quantity}`
    });
  }

  let seqDoc = await Sequence.findById('stockTransfer');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'stockTransfer', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('stockTransfer', { $inc: { seq: 1 } }, { new: true });
  }
  const transferNumber = `TRF-${seqDoc.seq}`;

  const isAdmin = req.user && req.user.role === 'Admin';

  const transfer = await StockTransfer.create({
    transferNumber,
    fromSiteId: cleanObjectId(resolvedFromSiteId),
    fromWarehouseId,
    toSiteId: cleanObjectId(resolvedToSiteId),
    toWarehouseId,
    materialId,
    batchNumber: batchNumber || 'DEFAULT',
    quantity: parseFloat(quantity),
    reason,
    notes,
    status: isAdmin ? 'Approved' : 'Pending Approval',
    approvedBy: isAdmin ? req.user.id : null,
    approvedAt: isAdmin ? new Date() : null,
    createdBy: req.user ? req.user.id : null,
  });

  if (isAdmin) {
    try {
      await InventoryLedgerService.recordTransaction({
        siteId: resolvedFromSiteId || null,
        warehouseId: fromWarehouseId,
        materialId,
        batchNumber: batchNumber || 'DEFAULT',
        type: 'RESERVATION',
        quantity: parseFloat(quantity),
        referenceDocument: 'StockTransfer',
        referenceId: transfer._id,
        userId: req.user.id,
        description: `Admin auto-approved transfer reservation: ${reason}`
      });
    } catch (err) {
      console.warn(`[Stock Transfer Create] Reservation notice: ${err.message}`);
    }
  }

  res.status(201).json({ success: true, data: transfer });
});

// @desc    Approve stock transfer request
// @route   POST /api/transfers/:id/approve
// @access  Private (Manager/Admin)
exports.approveStockTransfer = asyncHandler(async (req, res) => {
  const transfer = await StockTransfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, error: 'Transfer request not found' });
  }

  if (transfer.status !== 'Pending Approval') {
    return res.status(400).json({ success: false, error: `Transfer in state ${transfer.status} cannot be approved` });
  }

  // Record soft reservation at source warehouse
  try {
    await InventoryLedgerService.recordTransaction({
      materialId: transfer.materialId,
      warehouseId: transfer.fromWarehouseId,
      quantity: transfer.quantity,
      type: 'RESERVATION',
      referenceId: transfer.transferNumber,
      sourceDocType: 'StockTransfer',
      sourceDocId: transfer._id.toString(),
      reason: `Transfer reservation for TRF ${transfer.transferNumber}`,
      userId: req.user ? req.user.id : null,
    });
  } catch (err) {
    console.warn(`[Stock Transfer Approve] Reservation notice: ${err.message}`);
  }

  transfer.status = 'Approved';
  transfer.approvedBy = req.user ? req.user.id : null;
  transfer.approvedAt = Date.now();
  await transfer.save();

  res.status(200).json({ success: true, message: 'Stock transfer approved and stock reserved', data: transfer });
});

// @desc    Dispatch transfer (Move to In Transit - deduct from source)
// @route   POST /api/transfers/:id/dispatch
// @access  Private
exports.dispatchStockTransfer = asyncHandler(async (req, res) => {
  const transfer = await StockTransfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, error: 'Transfer request not found' });
  }

  if (transfer.status !== 'Approved') {
    return res.status(400).json({ success: false, error: `Transfer must be Approved before dispatching (current: ${transfer.status})` });
  }

  // Release reservation and deduct stock via TRANSFER_OUT
  try {
    await InventoryLedgerService.recordTransaction({
      materialId: transfer.materialId,
      warehouseId: transfer.fromWarehouseId,
      quantity: transfer.quantity,
      type: 'TRANSFER_OUT',
      referenceId: transfer.transferNumber,
      sourceDocType: 'StockTransfer',
      sourceDocId: transfer._id.toString(),
      reason: `Transfer dispatch to destination warehouse for ${transfer.transferNumber}`,
      userId: req.user ? req.user.id : null,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: `Dispatch failed: ${err.message}` });
  }

  transfer.status = 'In Transit';
  transfer.dispatchedAt = Date.now();
  await transfer.save();

  res.status(200).json({ success: true, message: 'Stock dispatched and in transit', data: transfer });
});

// @desc    Receive transfer (Complete Transfer - add to destination)
// @route   POST /api/transfers/:id/receive
// @access  Private
exports.receiveStockTransfer = asyncHandler(async (req, res) => {
  const transfer = await StockTransfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, error: 'Transfer request not found' });
  }

  if (transfer.status !== 'In Transit' && transfer.status !== 'Approved') {
    return res.status(400).json({ success: false, error: `Transfer in state ${transfer.status} cannot be received` });
  }

  // Add stock to destination warehouse via TRANSFER_IN
  try {
    await InventoryLedgerService.recordTransaction({
      materialId: transfer.materialId,
      warehouseId: transfer.toWarehouseId,
      quantity: transfer.quantity,
      type: 'TRANSFER_IN',
      referenceId: transfer.transferNumber,
      sourceDocType: 'StockTransfer',
      sourceDocId: transfer._id.toString(),
      reason: `Transfer receipt from source warehouse for ${transfer.transferNumber}`,
      userId: req.user ? req.user.id : null,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: `Receive failed: ${err.message}` });
  }

  transfer.status = 'Completed';
  transfer.receivedBy = req.user ? req.user.id : null;
  transfer.receivedAt = Date.now();
  await transfer.save();

  res.status(200).json({ success: true, message: 'Transfer received and completed successfully', data: transfer });
});

// @desc    Reject stock transfer request
// @route   POST /api/transfers/:id/reject
// @access  Private (Manager/Admin)
exports.rejectStockTransfer = asyncHandler(async (req, res) => {
  const transfer = await StockTransfer.findById(req.params.id);
  if (!transfer) {
    return res.status(404).json({ success: false, error: 'Transfer request not found' });
  }

  if (['Completed', 'Cancelled'].includes(transfer.status)) {
    return res.status(400).json({ success: false, error: `Cannot reject transfer in status ${transfer.status}` });
  }

  // If was approved, release soft reservation
  if (transfer.status === 'Approved') {
    try {
      await InventoryLedgerService.recordTransaction({
        materialId: transfer.materialId,
        warehouseId: transfer.fromWarehouseId,
        quantity: transfer.quantity,
        type: 'RELEASE',
        referenceId: transfer.transferNumber,
        sourceDocType: 'StockTransfer',
        sourceDocId: transfer._id.toString(),
        reason: `Reservation release for rejected transfer TRF ${transfer.transferNumber}`,
        userId: req.user ? req.user.id : null,
      });
    } catch (err) {
      console.warn(`[Reject Transfer] Release reservation warning: ${err.message}`);
    }
  }

  transfer.status = 'Rejected';
  transfer.rejectionReason = req.body.rejectionReason || 'Rejected by manager';
  await transfer.save();

  res.status(200).json({ success: true, message: 'Stock transfer rejected', data: transfer });
});
