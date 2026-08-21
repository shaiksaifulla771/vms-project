const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const { eventBus, EVENTS } = require('../events/eventBus');
const SequenceService = require('../services/sequenceService');

// @desc    Get all purchase orders
// @route   GET /api/purchases
// @access  Private
exports.getPurchaseOrders = async (req, res, next) => {
  try {
    const { status, siteId, warehouseId } = req.query;
    const query = { isDeleted: { $ne: true } };

    if (status) {
      query.status = status;
    }

    if (siteId && siteId !== 'ALL' && siteId !== '') {
      const Warehouse = require('../models/Warehouse');
      const siteWhs = await Warehouse.find({ siteId }).select('_id');
      const whIds = siteWhs.map(w => w._id);
      query.$or = [
        { siteId },
        { destinationWarehouseId: { $in: whIds } },
        { warehouseId: { $in: whIds } }
      ];
    }

    if (warehouseId && warehouseId !== 'ALL' && warehouseId !== 'all') {
      query.$or = [
        { warehouseId },
        { destinationWarehouseId: warehouseId }
      ];
    }

    const pos = await PurchaseOrder.find(query)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit type')
      .populate('requestedBy', 'username email role')
      .populate('approvedBy', 'username email role')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: pos.length, data: pos });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single purchase order
// @route   GET /api/purchases/:id
// @access  Private
exports.getPurchaseOrder = async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit type')
      .populate('requestedBy', 'username email role')
      .populate('approvedBy', 'username email role');

    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase Order not found' });
    }

    res.status(200).json({ success: true, data: po });
  } catch (err) {
    next(err);
  }
};

// @desc    Create purchase order
// @route   POST /api/purchases
// @access  Private
exports.createPurchaseOrder = async (req, res, next) => {
  try {
    const {
      vendorId,
      materials,
      siteId,
      destinationWarehouseId,
      warehouseId,
      expectedDeliveryDate,
      sourceType,
      sourceRequirementIds,
      notes,
    } = req.body;

    if (!vendorId || !materials || !Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide vendorId and materials list' });
    }

    // Verify vendor exists and is active
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    if (vendor.status !== 'Active') {
      return res.status(400).json({ success: false, error: 'Cannot create purchase orders for an Inactive vendor' });
    }

    // Resolve target warehouse & site
    const targetWhId = destinationWarehouseId || warehouseId || null;
    let targetSiteId = siteId || null;
    if (targetWhId && !targetSiteId) {
      const Warehouse = require('../models/Warehouse');
      const whDoc = await Warehouse.findById(targetWhId).select('siteId').lean();
      if (whDoc && whDoc.siteId) targetSiteId = whDoc.siteId;
    }

    // Compute totalAmount and validate components
    let totalAmount = 0;
    const validatedMaterials = [];

    for (let item of materials) {
      const mat = await Material.findById(item.materialId);
      if (!mat) {
        return res.status(404).json({ success: false, error: `Material with ID ${item.materialId} not found` });
      }
      
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice !== undefined ? item.unitPrice : mat.basePrice);

      if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, error: 'Material quantity and price must be valid positive numbers' });
      }

      totalAmount += Math.round((qty * price) * 100) / 100;
      validatedMaterials.push({
        materialId: item.materialId,
        quantity: qty,
        unitPrice: price,
        receivedQuantity: 0,
        rejectedQuantity: 0,
        lineStatus: 'OPEN',
        notes: item.notes || notes || '',
      });
    }

    const { nextSeqNumber } = require('../services/sequenceService');
    const poNumber = await nextSeqNumber('purchaseOrder', 'PO');

    const po = await PurchaseOrder.create({
      poNumber,
      vendorId,
      siteId: targetSiteId,
      destinationWarehouseId: targetWhId,
      warehouseId: targetWhId,
      materials: validatedMaterials,
      totalAmount,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : new Date(Date.now() + 7 * 86400000),
      orderDate: new Date(),
      sourceType: sourceType || 'MANUAL',
      sourceRequirementIds: Array.isArray(sourceRequirementIds) ? sourceRequirementIds : [],
      requestedBy: req.user._id,
      status: 'Pending'
    });

    const populated = await PurchaseOrder.findById(po._id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit')
      .populate('requestedBy', 'username email')
      .populate('destinationWarehouseId', 'name code')
      .populate('siteId', 'name code');

    const auditService = require('../services/auditService');
    await auditService.writeAuditLog(
      null,
      'PurchaseOrder',
      po._id,
      'CREATE',
      null,
      { poNumber, vendorId, totalAmount, siteId: targetSiteId, warehouseId: targetWhId },
      req.user ? req.user._id : null,
      req.correlationId,
      req.ip,
      req.headers['user-agent']
    );

    // Emit domain event for PO creation
    eventBus.emit(EVENTS.PO_CREATED, {
      poId: po._id,
      poNumber,
      vendorId,
      materials: validatedMaterials,
      totalAmount,
      requestedBy: req.user ? req.user._id : null,
      correlationId: req.correlationId
    });

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Approve or Reject PO
// @route   PATCH /api/purchases/:id/approve
// @access  Private (Admin & Manager)
exports.approveOrRejectPO = async (req, res, next) => {
  try {
    const { status } = req.body; // Approved or Rejected

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be Approved or Rejected' });
    }

    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase Order not found' });
    }

    // Strict state transition guard
    if (po.status !== 'Pending' && po.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        error: `Invalid transition. Purchase order is currently ${po.status} and cannot be approved/rejected.`
      });
    }

    po.status = status;
    po.approvedBy = req.user._id;
    await po.save();

    const populated = await PurchaseOrder.findById(po._id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit')
      .populate('requestedBy', 'username email')
      .populate('approvedBy', 'username email');

    // Emit domain event
    if (status === 'Approved') {
      eventBus.emit(EVENTS.PO_APPROVED, {
        poId: po._id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        approvedBy: req.user._id,
        correlationId: req.correlationId
      });
    }

    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Receive Goods (GRN - Stock-in with partial receiving and warehouse scoping)
// @route   PATCH /api/purchases/:id/receive
// @access  Private
exports.receiveGoods = async (req, res, next) => {
  try {
    const ProcurementAutomationService = require('../services/procurementAutomationService');

    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase Order not found' });
    }

    const targetWarehouseId = req.body.warehouseId || po.destinationWarehouseId || po.warehouseId;
    if (!targetWarehouseId) {
      return res.status(400).json({ success: false, error: 'Destination warehouse is required for Goods Receipt.' });
    }

    // Default to receiving all remaining items if items array is not explicitly provided
    let itemsToReceive = req.body.items;
    if (!itemsToReceive || !Array.isArray(itemsToReceive) || itemsToReceive.length === 0) {
      itemsToReceive = po.materials.map(m => ({
        materialId: m.materialId,
        receivedQuantity: Math.max(0, m.quantity - (m.receivedQuantity || 0)),
        rejectedQuantity: 0,
        lotNumber: req.body.lotNumber || '',
        batchNumber: req.body.batchNumber || '',
        locationBin: req.body.locationBin || '',
      }));
    }

    const grnResult = await ProcurementAutomationService.recordGoodsReceipt({
      poId: po._id,
      warehouseId: targetWarehouseId,
      siteId: req.body.siteId || po.siteId,
      items: itemsToReceive,
      receivedBy: req.user ? req.user._id : null,
      notes: req.body.notes || 'Goods receipt via purchasing terminal',
      correlationId: req.correlationId,
    });

    const populated = await PurchaseOrder.findById(po._id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit')
      .populate('requestedBy', 'username email')
      .populate('approvedBy', 'username email')
      .populate('destinationWarehouseId', 'name code');

    res.status(200).json({
      success: true,
      message: `Goods Receipt ${grnResult.grnNumber} processed successfully. Status: ${grnResult.status}`,
      grnNumber: grnResult.grnNumber,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};
