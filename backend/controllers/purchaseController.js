const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

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
    const { vendorId, materials } = req.body;

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

    // Compute totalAmount and validate components
    let totalAmount = 0;
    const validatedMaterials = [];

    for (let item of materials) {
      const mat = await Material.findById(item.materialId);
      if (!mat) {
        return res.status(404).json({ success: false, error: `Material with ID ${item.materialId} not found` });
      }
      
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);

      if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, error: 'Material quantity and price must be valid positive numbers' });
      }

      totalAmount += qty * price;
      validatedMaterials.push({
        materialId: item.materialId,
        quantity: qty,
        unitPrice: price
      });
    }

    // Sequence Generator logic for PO Number
    const Sequence = require('../models/Sequence');
    const activePOs = await PurchaseOrder.find(
      { poNumber: /^PO-\d+$/i, isDeleted: { $ne: true } },
      { poNumber: 1 }
    );

    let maxNum = 1000;
    activePOs.forEach(p => {
      if (p.poNumber) {
        const match = p.poNumber.toString().match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const seqDoc = await Sequence.findById('purchaseOrder');
    const seqNum = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
    const nextNum = Math.max(maxNum, seqNum) + 1;

    await Sequence.findByIdAndUpdate(
      'purchaseOrder',
      { $set: { seq: nextNum } },
      { upsert: true, new: true }
    );

    const poNumber = `PO-${nextNum}`;

    const po = await PurchaseOrder.create({
      poNumber,
      vendorId,
      materials: validatedMaterials,
      totalAmount,
      requestedBy: req.user._id,
      status: 'Pending'
    });

    const populated = await PurchaseOrder.findById(po._id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit')
      .populate('requestedBy', 'username email');

    const auditService = require('../services/auditService');
    await auditService.writeAuditLog(
      null,
      'PurchaseOrder',
      po._id,
      'CREATE',
      null,
      { poNumber, vendorId, totalAmount },
      req.user ? req.user._id : null,
      req.correlationId,
      req.ip,
      req.headers['user-agent']
    );

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
    if (po.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        error: `Invalid transition. Purchase order is already marked as ${po.status} and cannot be modified.`
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

    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Receive Goods (GRN - Stock-in)
// @route   PATCH /api/purchases/:id/receive
// @access  Private
exports.receiveGoods = async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase Order not found' });
    }

    // State validation: can only receive Approved orders
    if (po.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        error: `Cannot receive goods: Purchase Order status is currently '${po.status}'. Only 'Approved' orders can be received.`
      });
    }

    // Process Stock-In for each material in the PO
    for (let item of po.materials) {
      // Find or initialize inventory item
      let stockItem = await InventoryItem.findOne({ materialId: item.materialId });
      if (!stockItem) {
        stockItem = await InventoryItem.create({
          materialId: item.materialId,
          warehouseId: req.body.warehouseId,
          balance: 0,
          onHand: 0,
          available: 0
        });
      }

      // Add to inventory
      stockItem.onHand = (stockItem.onHand || 0) + item.quantity;
      stockItem.available = (stockItem.available || 0) + item.quantity;
      stockItem.updatedAt = Date.now();
      await stockItem.save();

      // Log stock transaction
      await InventoryTransaction.create({
        materialId: item.materialId,
        warehouseId: req.body.warehouseId,
        quantity: item.quantity,
        type: 'purchase',
        referenceId: po._id.toString(),
        notes: `Received items from PO #${po._id.toString().slice(-6).toUpperCase()}`
      });
    }

    const auditService = require('../services/auditService');
    await auditService.writeAuditLog(
      null,
      'PurchaseOrder',
      po._id,
      'UPDATE',
      { status: po.status },
      { status: 'Received' },
      req.user ? req.user._id : null,
      req.correlationId,
      req.ip,
      req.headers['user-agent']
    );

    po.status = 'Received';
    await po.save();

    const populated = await PurchaseOrder.findById(po._id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit')
      .populate('requestedBy', 'username email')
      .populate('approvedBy', 'username email');

    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};
