const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const Material = require('../models/Material');

// @desc    Get all inventory item balances
// @route   GET /api/inventory
// @access  Private
exports.getInventoryBalances = async (req, res, next) => {
  try {
    const balances = await InventoryItem.find()
      .populate('materialId', 'name code unit type description')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, count: balances.length, data: balances });
  } catch (err) {
    next(err);
  }
};

// @desc    Get inventory audit trail transactions
// @route   GET /api/inventory/transactions
// @access  Private
exports.getInventoryTransactions = async (req, res, next) => {
  try {
    const transactions = await InventoryTransaction.find()
      .populate('materialId', 'name code unit type')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    next(err);
  }
};

// @desc    Create manual inventory adjustment (correction/write-off)
// @route   POST /api/inventory/adjustment
// @access  Private
exports.createAdjustment = async (req, res, next) => {
  try {
    const { materialId, quantity, notes } = req.body;

    if (!materialId || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'Please provide materialId and adjustment quantity' });
    }

    const adjQty = parseFloat(quantity);
    if (isNaN(adjQty) || adjQty === 0) {
      return res.status(400).json({ success: false, error: 'Adjustment quantity must be a non-zero number' });
    }

    // Verify material exists
    const material = await Material.findById(materialId);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }

    // Find or initialize inventory item
    let stockItem = await InventoryItem.findOne({ materialId });
    if (!stockItem) {
      stockItem = await InventoryItem.create({ materialId, balance: 0 });
    }

    // Check if adjustment causes negative balance
    const newBalance = stockItem.balance + adjQty;
    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Current balance is ${stockItem.balance} ${material.unit}. Cannot perform adjustment of ${adjQty} ${material.unit}.`
      });
    }

    // Apply adjustment and save
    stockItem.balance = newBalance;
    stockItem.updatedAt = Date.now();
    await stockItem.save();

    // Log transaction
    const tx = await InventoryTransaction.create({
      materialId,
      quantity: adjQty,
      type: 'adjustment',
      notes: notes || 'Manual warehouse stock adjustment'
    });

    res.status(201).json({
      success: true,
      data: {
        item: stockItem,
        transaction: tx
      }
    });
  } catch (err) {
    next(err);
  }
};
