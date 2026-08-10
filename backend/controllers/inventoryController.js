const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const Material = require('../models/Material');
const StockAdjustment = require('../models/StockAdjustment');
const Sequence = require('../models/Sequence');

// @desc    Get all inventory item balances with optional site/warehouse/material filtering
// @route   GET /api/inventory
// @access  Private
exports.getInventoryBalances = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
    if (req.query.siteId) filter.siteId = req.query.siteId;
    if (req.query.materialId) filter.materialId = req.query.materialId;

    const balances = await InventoryItem.find(filter)
      .populate('materialId', 'name code unit type category description')
      .populate('warehouseId', 'name code type')
      .populate('siteId', 'name code')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, count: balances.length, data: balances });
  } catch (err) {
    next(err);
  }
};

// @desc    Get inventory audit trail transactions with site/warehouse filtering
// @route   GET /api/inventory/transactions
// @access  Private
exports.getInventoryTransactions = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
    if (req.query.siteId) filter.siteId = req.query.siteId;
    if (req.query.materialId) filter.materialId = req.query.materialId;
    if (req.query.type) filter.type = req.query.type;

    const transactions = await InventoryTransaction.find(filter)
      .populate('materialId', 'name code unit type')
      .populate('warehouseId', 'name code')
      .populate('siteId', 'name code')
      .populate('userId', 'username email')
      .populate('approvedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    next(err);
  }
};

// @desc    Create manual inventory adjustment request (for backwards compatibility & approval flow)
// @route   POST /api/inventory/adjustment
// @access  Private
exports.createAdjustment = async (req, res, next) => {
  try {
    const { materialId, warehouseId, quantity, notes, reason } = req.body;

    if (!materialId || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'Please provide materialId and adjustment quantity' });
    }

    const adjQty = parseFloat(quantity);
    if (isNaN(adjQty) || adjQty === 0) {
      return res.status(400).json({ success: false, error: 'Adjustment quantity must be a non-zero number' });
    }

    const material = await Material.findById(materialId);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }

    // Default to first active warehouse if not provided
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      const Warehouse = require('../models/Warehouse');
      const defaultWh = await Warehouse.findOne({ status: 'Active' }) || await Warehouse.findOne();
      if (!defaultWh) {
        return res.status(400).json({ success: false, error: 'No warehouse location found in system' });
      }
      targetWarehouseId = defaultWh._id;
    }

    const adjustmentType = adjQty > 0 ? 'IN' : 'OUT';
    const absQty = Math.abs(adjQty);

    let seqDoc = await Sequence.findById('stockAdjustment');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'stockAdjustment', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('stockAdjustment', { $inc: { seq: 1 } }, { new: true });
    }
    const adjNumber = `ADJ-${seqDoc.seq}`;

    // Create pending approval stock adjustment record
    const adjustment = await StockAdjustment.create({
      adjNumber,
      warehouseId: targetWarehouseId,
      materialId,
      adjustmentType,
      quantity: absQty,
      reason: reason || notes || 'Manual warehouse stock adjustment',
      description: notes || '',
      status: 'Pending Approval',
      createdBy: req.user ? req.user.id : null,
    });

    res.status(201).json({
      success: true,
      message: `Stock adjustment request ${adjNumber} submitted for approval (Created By: ${req.user ? req.user.username : 'User'})`,
      data: adjustment
    });
  } catch (err) {
    next(err);
  }
};
