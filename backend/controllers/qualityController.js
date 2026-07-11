const QualityRecord = require('../models/QualityRecord');
const ProductionOrder = require('../models/ProductionOrder');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

// @desc    Get all quality records
// @route   GET /api/quality
// @access  Private
exports.getQualityRecords = async (req, res, next) => {
  try {
    const records = await QualityRecord.find()
      .populate({
        path: 'productionOrderId',
        populate: {
          path: 'bomId',
          populate: { path: 'productId', select: 'name code unit type' }
        }
      })
      .populate('inspectedBy', 'username email role')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: records.length, data: records });
  } catch (err) {
    next(err);
  }
};

// @desc    Perform quality inspection (gates finished goods stock-in)
// @route   POST /api/quality
// @access  Private (Admin & Manager)
exports.inspectProduction = async (req, res, next) => {
  try {
    const { productionOrderId, status, notes } = req.body;

    if (!productionOrderId || !status) {
      return res.status(400).json({ success: false, error: 'Please provide productionOrderId and inspection status' });
    }

    if (!['Passed', 'Failed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be Passed or Failed' });
    }

    // Verify production order
    const order = await ProductionOrder.findById(productionOrderId).populate('bomId');
    if (!order) {
      return res.status(404).json({ success: false, error: 'Production order not found' });
    }

    // Check status: can only inspect Completed runs
    if (order.status !== 'Completed') {
      return res.status(400).json({
        success: false,
        error: `Cannot perform QC check: order status is currently '${order.status}'. QC inspection requires the production run to be 'Completed'.`
      });
    }

    // Check if quality record already exists for this order
    const existing = await QualityRecord.findOne({ productionOrderId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'This production lot has already been inspected' });
    }

    // If Passed, add finished product to Inventory
    if (status === 'Passed') {
      const bom = await BOM.findById(order.bomId);
      const finishedProduct = bom.productId;

      // Find or initialize inventory item for the finished product
      let stockItem = await InventoryItem.findOne({ materialId: finishedProduct });
      if (!stockItem) {
        stockItem = await InventoryItem.create({ materialId: finishedProduct, balance: 0 });
      }

      // Add finished good to stock balance
      stockItem.balance += order.quantity;
      stockItem.updatedAt = Date.now();
      await stockItem.save();

      // Log stock transaction
      await InventoryTransaction.create({
        materialId: finishedProduct,
        quantity: order.quantity,
        type: 'production',
        referenceId: order._id.toString(),
        notes: `Production lot received from completed run #${order._id.toString().slice(-6).toUpperCase()}`
      });
    }

    // Save Quality Record
    const record = await QualityRecord.create({
      productionOrderId,
      status,
      notes: notes || (status === 'Passed' ? 'Lot meets all quality standards.' : 'Defects detected, flagged for rework.'),
      inspectedBy: req.user._id
    });

    // Update Production Order status to final QC Checked
    order.status = 'QC Checked';
    await order.save();

    const populated = await QualityRecord.findById(record._id)
      .populate({
        path: 'productionOrderId',
        populate: {
          path: 'bomId',
          populate: { path: 'productId', select: 'name code unit' }
        }
      })
      .populate('inspectedBy', 'username email');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};
