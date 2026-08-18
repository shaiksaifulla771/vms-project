const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const StockAdjustment = require('../models/StockAdjustment');
const Sequence = require('../models/Sequence');

// Helper: Auto-sync missing site references on InventoryItems from their parent warehouses
async function autoSyncSiteReferences() {
  try {
    const itemsWithoutSite = await InventoryItem.find({
      $or: [{ siteId: { $exists: false } }, { siteId: null }]
    }).populate('warehouseId', 'siteId');

    const bulkOps = [];
    for (const item of itemsWithoutSite) {
      if (item.warehouseId && item.warehouseId.siteId) {
        bulkOps.push({
          updateOne: {
            filter: { _id: item._id },
            update: { $set: { siteId: item.warehouseId.siteId } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await InventoryItem.bulkWrite(bulkOps);
    }
  } catch (err) {
    console.warn('[Inventory] Auto-sync site references note:', err.message);
  }
}

// @desc    Get all inventory item balances with optional site/warehouse/material/status filtering & summary
// @route   GET /api/inventory
// @access  Private
exports.getInventoryBalances = async (req, res, next) => {
  try {
    const filter = {};

    // 1. Warehouse Filter
    if (req.query.warehouseId && req.query.warehouseId !== '' && req.query.warehouseId !== 'ALL') {
      filter.warehouseId = req.query.warehouseId;
    }

    // 2. Site Filter (resolves child warehouse hierarchy so items without explicit siteId are matched)
    if (req.query.siteId && req.query.siteId !== '' && req.query.siteId !== 'ALL') {
      const siteWhs = await Warehouse.find({ siteId: req.query.siteId }).select('_id');
      const whIds = siteWhs.map(w => w._id);
      
      if (filter.warehouseId) {
        // Both site and warehouse provided
        filter.$and = [
          { warehouseId: filter.warehouseId },
          { $or: [{ siteId: req.query.siteId }, { warehouseId: { $in: whIds } }] }
        ];
        delete filter.warehouseId;
      } else {
        filter.$or = [
          { siteId: req.query.siteId },
          { warehouseId: { $in: whIds } }
        ];
      }
    }

    // 3. Material Filter
    if (req.query.materialId && req.query.materialId !== '' && req.query.materialId !== 'ALL') {
      filter.materialId = req.query.materialId;
    }

    // 4. Search Filter (material name, code, batch, lot)
    if (req.query.search && req.query.search.trim() !== '') {
      const q = req.query.search.trim();
      const matchingMaterials = await Material.find({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { code: { $regex: q, $options: 'i' } }
        ]
      }).select('_id');

      const matIds = matchingMaterials.map(m => m._id);
      const searchConditions = [
        { materialId: { $in: matIds } },
        { batchNumber: { $regex: q, $options: 'i' } },
        { lotNumber: { $regex: q, $options: 'i' } }
      ];

      if (filter.$or) {
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: filter.$or });
        filter.$and.push({ $or: searchConditions });
        delete filter.$or;
      } else if (filter.$and) {
        filter.$and.push({ $or: searchConditions });
      } else {
        filter.$or = searchConditions;
      }
    }

    // Execute query with .lean() for zero-overhead performance
    const balances = await InventoryItem.find(filter)
      .populate('materialId', 'name code unit type subcategory description basePrice standardCost safetyStock reorderLevel')
      .populate('warehouseId', 'name code type siteId')
      .populate('siteId', 'name code')
      .sort({ updatedAt: -1 })
      .lean();

    // Filter out orphaned records if any
    const validBalances = balances.filter(b => b.materialId && b.warehouseId);

    // Compute live summary statistics
    let totalOnHandUnits = 0;
    let totalAvailableUnits = 0;
    let totalReservedUnits = 0;
    let totalStockValuation = 0;
    let inStockCount = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    validBalances.forEach(item => {
      const onHand = item.balance !== undefined ? item.balance : (item.onHand || 0);
      const reserved = item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0);
      const available = Math.max(0, onHand - reserved);
      const unitPrice = Number(item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || 0);

      totalOnHandUnits += onHand;
      totalAvailableUnits += available;
      totalReservedUnits += reserved;
      totalStockValuation += (onHand * unitPrice);

      if (available > 0) {
        inStockCount++;
      } else {
        outOfStockCount++;
      }

      const reorderLvl = item.materialId?.reorderLevel || item.materialId?.safetyStock || 0;
      if (reorderLvl > 0 && available <= reorderLvl) {
        lowStockCount++;
      }
    });

    // Optional status filter (post-population or in-memory)
    let results = validBalances;
    if (req.query.status === 'IN_STOCK') {
      results = results.filter(i => (i.balance || i.onHand || 0) > (i.reservedBalance || i.reserved || 0));
    } else if (req.query.status === 'OUT_OF_STOCK') {
      results = results.filter(i => (i.balance || i.onHand || 0) <= (i.reservedBalance || i.reserved || 0));
    } else if (req.query.status === 'LOW_STOCK') {
      results = results.filter(i => {
        const avail = (i.balance || i.onHand || 0) - (i.reservedBalance || i.reserved || 0);
        const reorder = i.materialId?.reorderLevel || i.materialId?.safetyStock || 10;
        return avail <= reorder && avail > 0;
      });
    }

    res.status(200).json({
      success: true,
      count: results.length,
      totalRecords: validBalances.length,
      summary: {
        totalSKUs: validBalances.length,
        totalOnHandUnits: Math.round(totalOnHandUnits * 100) / 100,
        totalAvailableUnits: Math.round(totalAvailableUnits * 100) / 100,
        totalReservedUnits: Math.round(totalReservedUnits * 100) / 100,
        totalStockValuation: Math.round(totalStockValuation * 100) / 100,
        inStockCount,
        outOfStockCount,
        lowStockCount
      },
      data: results
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get inventory summary dashboard metrics
// @route   GET /api/inventory/summary
// @access  Private
exports.getInventorySummary = async (req, res, next) => {
  try {
    const items = await InventoryItem.find()
      .populate('materialId', 'name code unit type basePrice safetyStock reorderLevel')
      .populate('warehouseId', 'name code siteId')
      .populate('siteId', 'name code')
      .lean();

    const validItems = items.filter(i => i.materialId && i.warehouseId);

    let totalOnHandUnits = 0;
    let totalAvailableUnits = 0;
    let totalReservedUnits = 0;
    let totalStockValuation = 0;
    let inStockCount = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    validItems.forEach(item => {
      const onHand = item.balance !== undefined ? item.balance : (item.onHand || 0);
      const reserved = item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0);
      const available = Math.max(0, onHand - reserved);
      const unitPrice = item.materialId?.basePrice || 0;

      totalOnHandUnits += onHand;
      totalAvailableUnits += available;
      totalReservedUnits += reserved;
      totalStockValuation += (onHand * unitPrice);

      if (available > 0) inStockCount++;
      else outOfStockCount++;

      const reorderLvl = item.materialId?.reorderLevel || item.materialId?.safetyStock || 0;
      if (reorderLvl > 0 && available <= reorderLvl) lowStockCount++;
    });

    res.status(200).json({
      success: true,
      summary: {
        totalSKUs: validItems.length,
        totalOnHandUnits: Math.round(totalOnHandUnits * 100) / 100,
        totalAvailableUnits: Math.round(totalAvailableUnits * 100) / 100,
        totalReservedUnits: Math.round(totalReservedUnits * 100) / 100,
        totalStockValuation: Math.round(totalStockValuation * 100) / 100,
        inStockCount,
        outOfStockCount,
        lowStockCount
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync missing site references on InventoryItems
// @route   POST /api/inventory/sync-sites
// @access  Private
exports.syncMissingSiteReferences = async (req, res, next) => {
  try {
    await autoSyncSiteReferences();
    const updatedCount = await InventoryItem.countDocuments({ siteId: { $ne: null } });
    res.status(200).json({
      success: true,
      message: `Site references synchronized. ${updatedCount} items have active site references.`,
      updatedCount
    });
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
    if (req.query.warehouseId && req.query.warehouseId !== '' && req.query.warehouseId !== 'ALL') {
      filter.warehouseId = req.query.warehouseId;
    }
    if (req.query.siteId && req.query.siteId !== '' && req.query.siteId !== 'ALL') {
      const siteWhs = await Warehouse.find({ siteId: req.query.siteId }).select('_id');
      const whIds = siteWhs.map(w => w._id);
      if (filter.warehouseId) {
        filter.$and = [
          { warehouseId: filter.warehouseId },
          { $or: [{ siteId: req.query.siteId }, { warehouseId: { $in: whIds } }] }
        ];
        delete filter.warehouseId;
      } else {
        filter.$or = [
          { siteId: req.query.siteId },
          { warehouseId: { $in: whIds } }
        ];
      }
    }
    if (req.query.materialId && req.query.materialId !== '' && req.query.materialId !== 'ALL') {
      filter.materialId = req.query.materialId;
    }
    if (req.query.type && req.query.type !== '' && req.query.type !== 'ALL') {
      filter.type = req.query.type;
    }

    const limit = parseInt(req.query.limit) || 500;
    const transactions = await InventoryTransaction.find(filter)
      .populate('materialId', 'name code unit type')
      .populate('warehouseId', 'name code')
      .populate('siteId', 'name code')
      .populate('userId', 'username email')
      .populate('approvedBy', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    next(err);
  }
};

// @desc    Create manual inventory adjustment request
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

    const isAdmin = req.user && req.user.role === 'Admin';

    // Create stock adjustment record
    const adjustment = await StockAdjustment.create({
      adjNumber,
      warehouseId: targetWarehouseId,
      materialId,
      adjustmentType,
      quantity: absQty,
      reason: reason || notes || 'Manual warehouse stock adjustment',
      description: notes || '',
      status: isAdmin ? 'Approved' : 'Pending Approval',
      approvedBy: isAdmin ? req.user.id : null,
      approvedAt: isAdmin ? new Date() : null,
      createdBy: req.user ? req.user.id : null,
    });

    if (isAdmin) {
      const InventoryLedgerService = require('../services/inventoryLedgerService');
      const txnType = adjustmentType === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      try {
        await InventoryLedgerService.recordTransaction({
          warehouseId: targetWarehouseId,
          materialId,
          type: txnType,
          quantity: absQty,
          sourceDocType: 'StockAdjustment',
          sourceDocId: adjustment._id.toString(),
          referenceId: adjNumber,
          userId: req.user ? req.user.id : null,
          reason: `Admin adjustment: ${reason || notes || 'Manual adjustment'}`
        });
      } catch (txnErr) {
        console.warn('[Inventory createAdjustment] Ledger notice:', txnErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: isAdmin ? `Stock adjustment ${adjNumber} approved & inventory ledger updated` : `Stock adjustment request ${adjNumber} submitted for approval (Created By: ${req.user ? req.user.username : 'User'})`,
      data: adjustment
    });
  } catch (err) {
    next(err);
  }
};
