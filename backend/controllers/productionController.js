const ProductionOrder = require('../models/ProductionOrder');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

// Helper: Calculate stock availability (MRP planning core)
const performMRPCheck = async (bomId, targetQuantity) => {
  const bom = await BOM.findById(bomId).populate('components.materialId');
  if (!bom) {
    throw new Error('Bill of Materials (BOM) recipe not found');
  }

  const details = [];
  let canProduce = true;

  for (let comp of bom.components) {
    const rawMaterial = comp.materialId;
    const required = comp.quantity * targetQuantity;

    // Fetch warehouse stock balance
    const stock = await InventoryItem.findOne({ materialId: rawMaterial._id });
    const available = stock ? stock.balance : 0;
    const shortfall = Math.max(0, required - available);

    if (shortfall > 0) {
      canProduce = false;
    }

    details.push({
      materialId: rawMaterial._id,
      name: rawMaterial.name,
      code: rawMaterial.code,
      unit: rawMaterial.unit,
      required,
      available,
      shortfall,
      status: shortfall > 0 ? 'Deficit' : 'In Stock'
    });
  }

  return { canProduce, details };
};

// @desc    Calculate MRP requirements (Stock availability planner)
// @route   GET /api/planning/mrp
// @access  Private
exports.getMRPPlanning = async (req, res, next) => {
  try {
    const { productId, quantity } = req.query;

    if (!productId || !quantity) {
      return res.status(400).json({ success: false, error: 'Please provide productId and target quantity' });
    }

    const targetQty = parseFloat(quantity);
    if (isNaN(targetQty) || targetQty <= 0) {
      return res.status(400).json({ success: false, error: 'Target quantity must be a positive number' });
    }

    // Find BOM for this product
    const bom = await BOM.findOne({ productId });
    if (!bom) {
      return res.status(404).json({
        success: false,
        error: 'No Bill of Materials (BOM) recipe found for this product. Configure a BOM recipe first.'
      });
    }

    const mrp = await performMRPCheck(bom._id, targetQty);
    res.status(200).json({ success: true, data: mrp });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all production orders
// @route   GET /api/productions
// @access  Private
exports.getProductionOrders = async (req, res, next) => {
  try {
    const orders = await ProductionOrder.find()
      .populate({
        path: 'bomId',
        populate: [
          { path: 'productId', select: 'name code unit type' },
          { path: 'components.materialId', select: 'name code unit' }
        ]
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a production order (Pending status)
// @route   POST /api/productions
// @access  Private
exports.createProductionOrder = async (req, res, next) => {
  try {
    const { bomId, quantity } = req.body;

    if (!bomId || !quantity) {
      return res.status(400).json({ success: false, error: 'Please provide bomId and production quantity' });
    }

    const targetQty = parseFloat(quantity);
    if (isNaN(targetQty) || targetQty <= 0) {
      return res.status(400).json({ success: false, error: 'Target quantity must be a positive number' });
    }

    // Verify BOM exists
    const bom = await BOM.findById(bomId).populate('productId');
    if (!bom) {
      return res.status(404).json({ success: false, error: 'Bill of Materials (BOM) recipe not found' });
    }

    const order = await ProductionOrder.create({
      bomId,
      quantity: targetQty,
      status: 'Pending'
    });

    const populated = await ProductionOrder.findById(order._id)
      .populate({
        path: 'bomId',
        populate: { path: 'productId', select: 'name code unit type' }
      });

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Start Production Run (consuming raw materials)
// @route   PATCH /api/productions/:id/start
// @access  Private
exports.startProduction = async (req, res, next) => {
  try {
    const order = await ProductionOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Production order not found' });
    }

    if (order.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot start production: order status is currently '${order.status}'. Only 'Pending' orders can be started.`
      });
    }

    // Run MRP check to verify materials are in stock
    const mrp = await performMRPCheck(order.bomId, order.quantity);
    if (!mrp.canProduce) {
      return res.status(400).json({
        success: false,
        error: 'Cannot start production: insufficient raw material stock. View Planning (MRP) for deficits details.'
      });
    }

    // Deduct stock for each component in the BOM
    const bom = await BOM.findById(order.bomId);
    for (let comp of bom.components) {
      const stockItem = await InventoryItem.findOne({ materialId: comp.materialId });
      const consumeQty = comp.quantity * order.quantity;

      stockItem.balance -= consumeQty;
      stockItem.updatedAt = Date.now();
      await stockItem.save();

      // Log material consumption transaction
      await InventoryTransaction.create({
        materialId: comp.materialId,
        quantity: -consumeQty, // Negative for stock-out
        type: 'consumption',
        referenceId: order._id.toString(),
        notes: `Consumed for Production Order #${order._id.toString().slice(-6).toUpperCase()}`
      });
    }

    order.status = 'In Progress';
    await order.save();

    const populated = await ProductionOrder.findById(order._id)
      .populate({
        path: 'bomId',
        populate: { path: 'productId', select: 'name code unit' }
      });

    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Complete Production Run
// @route   PATCH /api/productions/:id/complete
// @access  Private
exports.completeProduction = async (req, res, next) => {
  try {
    const order = await ProductionOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Production order not found' });
    }

    if (order.status !== 'In Progress') {
      return res.status(400).json({
        success: false,
        error: `Cannot complete production: order status is currently '${order.status}'. Only 'In Progress' orders can be completed.`
      });
    }

    order.status = 'Completed';
    await order.save();

    const populated = await ProductionOrder.findById(order._id)
      .populate({
        path: 'bomId',
        populate: { path: 'productId', select: 'name code unit' }
      });

    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};
