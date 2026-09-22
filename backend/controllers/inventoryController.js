const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const StockAdjustment = require('../models/StockAdjustment');
const Sequence = require('../models/Sequence');
const BOM = require('../models/BOM');
const MPN = require('../models/MPN');
const { escapeRegex } = require('../utils/regex');
const authz = require('../utils/authz');
const scopeResolver = require('../utils/scopeResolver');
const InventoryLedgerService = require('../services/inventoryLedgerService');

/**
 * Resolves BOM Unit Costs & Pricing for an array of materials.
 * For items with an Active or Draft BOM, calculates:
 * BOM Unit Cost = (Sum of Component Costs + Packaging + Processing + Overhead) / Batch Size
 */
async function resolveMaterialPricesAndBomCosts(materialIds) {
  if (!materialIds || !materialIds.length) return { bomMap: {}, mpnMap: {} };
  if (mongoose.connection.readyState === 0) return { bomMap: {}, mpnMap: {} };

  try {
    const [boms, mpns] = await Promise.all([
      BOM.find({ productId: { $in: materialIds }, status: { $ne: 'Deleted' } })
        .populate('components.materialId', 'basePrice unitPrice standardCost cost name code')
        .populate('components.mpnId', 'price name partNumber')
        .sort({ status: 1, updatedAt: -1 })
        .lean(),
      MPN.find({ materialId: { $in: materialIds }, status: 'Active' })
        .sort({ price: 1 })
        .lean()
    ]);

    const bomMap = {};
    for (const bom of boms) {
      const prodIdStr = bom.productId ? (bom.productId._id || bom.productId).toString() : null;
      if (!prodIdStr || (bomMap[prodIdStr] && bomMap[prodIdStr].status === 'Active' && bom.status !== 'Active')) {
        continue;
      }

      let compTotal = 0;
      if (bom.components && Array.isArray(bom.components)) {
        for (const comp of bom.components) {
          const qty = Number(comp.quantity !== undefined ? comp.quantity : (comp.qty || 0));
          const lossPercent = Number(comp.lossPercentage !== undefined ? comp.lossPercentage : (comp.lossPercent || 0));
          const lossFactor = lossPercent > 0 && lossPercent < 100 ? (1 - lossPercent / 100) : 1;
          const price = Number(comp.mpnId?.price || comp.materialId?.basePrice || comp.materialId?.unitPrice || comp.materialId?.standardCost || comp.materialId?.cost || 0);
          const lineCost = lossFactor > 0 ? (qty * price) / lossFactor : (qty * price);
          compTotal += lineCost;
        }
      }

      const packagingCost = Number(bom.packagingCost || 0);
      const processingCost = Number(bom.processingCost || 0);
      const overheadCost = Number(bom.overheadCost || 0);
      const totalBomCost = compTotal + packagingCost + processingCost + overheadCost;
      const batchSize = Number(bom.batchSize || 1) > 0 ? Number(bom.batchSize) : 1;
      const unitCost = Math.round((totalBomCost / batchSize) * 100) / 100;

      bomMap[prodIdStr] = {
        bomId: bom._id,
        bomNumber: bom.bomNumber || 'BOM',
        status: bom.status,
        batchSize,
        totalCost: Math.round(totalBomCost * 100) / 100,
        unitCost,
        hasBom: true
      };
    }

    const mpnMap = {};
    for (const mpn of mpns) {
      const matIdStr = mpn.materialId ? (mpn.materialId._id || mpn.materialId).toString() : null;
      if (matIdStr && (!mpnMap[matIdStr] || mpn.price > 0)) {
        mpnMap[matIdStr] = mpn.price;
      }
    }

    return { bomMap, mpnMap };
  } catch (err) {
    console.error('[Inventory] Error resolving BOM costs:', err.message);
    return { bomMap: {}, mpnMap: {} };
  }
}

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

    // 0. Enforce Multi-Site Location Scope for Non-Global Admins
    if (req.user && !authz.isGlobalAdmin(req.user)) {
      const { siteIds, warehouseIds } = await scopeResolver.getUserAssignedScopes(req.user);
      if (warehouseIds && warehouseIds.length > 0) {
        if (!req.query.warehouseId || req.query.warehouseId === 'ALL') {
          filter.warehouseId = { $in: warehouseIds };
        }
      } else if (siteIds && siteIds.length > 0) {
        if (!req.query.siteId || req.query.siteId === 'ALL') {
          const scopedWhs = await Warehouse.find({ siteId: { $in: siteIds } }).select('_id');
          const scopedWhIds = scopedWhs.map(w => w._id);
          filter.$or = [
            { siteId: { $in: siteIds } },
            { warehouseId: { $in: scopedWhIds } }
          ];
        }
      }
    }

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
      const q = escapeRegex(req.query.search.trim());
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
      .populate('materialId', 'name code unit type subcategory description basePrice unitPrice standardCost cost purchasePrice price safetyStock reorderLevel')
      .populate('warehouseId', 'name code type siteId')
      .populate('siteId', 'name code')
      .sort({ updatedAt: -1 })
      .lean();

    // Filter out orphaned records if any
    const validBalances = balances.filter(b => b.materialId && b.warehouseId);

    // Extract unique material IDs to fetch BOM costs & MPN prices
    const uniqueMatIds = [...new Set(validBalances.map(b => (b.materialId._id || b.materialId).toString()))];
    const { bomMap, mpnMap } = await resolveMaterialPricesAndBomCosts(uniqueMatIds);

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

      const matIdStr = (item.materialId._id || item.materialId).toString();
      const bomInfo = bomMap[matIdStr];
      const mpnPrice = mpnMap[matIdStr];

      // Priority:
      // 1. BOM Unit Cost (if item has an active/draft BOM recipe)
      // 2. Material Master basePrice / unitPrice / standardCost / cost
      // 3. MPN Price
      // 4. Stored InventoryItem.unitPrice
      let unitPrice = 0;
      let priceSource = 'Default';

      if (bomInfo && bomInfo.unitCost > 0) {
        unitPrice = bomInfo.unitCost;
        priceSource = `BOM (${bomInfo.bomNumber})`;
        item.hasBom = true;
        item.bomNumber = bomInfo.bomNumber;
        item.bomUnitCost = bomInfo.unitCost;
      } else if (item.materialId?.basePrice > 0) {
        unitPrice = Number(item.materialId.basePrice);
        priceSource = 'Material Master';
      } else if (item.materialId?.unitPrice > 0) {
        unitPrice = Number(item.materialId.unitPrice);
        priceSource = 'Material Master';
      } else if (item.materialId?.standardCost > 0) {
        unitPrice = Number(item.materialId.standardCost);
        priceSource = 'Standard Cost';
      } else if (item.materialId?.cost > 0) {
        unitPrice = Number(item.materialId.cost);
        priceSource = 'Cost';
      } else if (mpnPrice > 0) {
        unitPrice = Number(mpnPrice);
        priceSource = 'MPN';
      } else if (item.unitPrice > 0) {
        unitPrice = Number(item.unitPrice);
        priceSource = 'Inventory Item';
      } else if (bomInfo && bomInfo.hasBom) {
        unitPrice = bomInfo.unitCost || 0;
        priceSource = 'BOM';
        item.hasBom = true;
        item.bomNumber = bomInfo.bomNumber;
      }

      item.unitPrice = Math.round(unitPrice * 100) / 100;
      item.totalValue = Math.round(onHand * unitPrice * 100) / 100;
      item.priceSource = priceSource;

      totalOnHandUnits += onHand;
      totalAvailableUnits += available;
      totalReservedUnits += reserved;
      totalStockValuation += (onHand * unitPrice);

      item.onHand = onHand;
      item.reserved = reserved;
      item.available = available;

      const reorderLvl = item.materialId?.reorderLevel || item.materialId?.safetyStock || 0;
      if (available <= 0) {
        item.status = 'out_of_stock';
        outOfStockCount++;
      } else if (reorderLvl > 0 && available <= reorderLvl) {
        item.status = 'low_stock';
        lowStockCount++;
      } else {
        item.status = 'in_stock';
        inStockCount++;
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
    console.error('[Inventory ERROR]:', err);
    next(err);
  }
};

// @desc    Get inventory summary dashboard metrics
// @route   GET /api/inventory/summary
// @access  Private
exports.getInventorySummary = async (req, res, next) => {
  try {
    const items = await InventoryItem.find()
      .populate('materialId', 'name code unit type basePrice unitPrice standardCost cost safetyStock reorderLevel')
      .populate('warehouseId', 'name code siteId')
      .populate('siteId', 'name code')
      .lean();

    const validItems = items.filter(i => i.materialId && i.warehouseId);
    const uniqueMatIds = [...new Set(validItems.map(b => (b.materialId._id || b.materialId).toString()))];
    const { bomMap, mpnMap } = await resolveMaterialPricesAndBomCosts(uniqueMatIds);

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

      const matIdStr = (item.materialId._id || item.materialId).toString();
      const bomInfo = bomMap[matIdStr];
      const mpnPrice = mpnMap[matIdStr];

      let unitPrice = 0;
      if (bomInfo && bomInfo.unitCost > 0) {
        unitPrice = bomInfo.unitCost;
      } else if (item.materialId?.basePrice > 0) {
        unitPrice = Number(item.materialId.basePrice);
      } else if (item.materialId?.unitPrice > 0) {
        unitPrice = Number(item.materialId.unitPrice);
      } else if (item.materialId?.standardCost > 0) {
        unitPrice = Number(item.materialId.standardCost);
      } else if (item.materialId?.cost > 0) {
        unitPrice = Number(item.materialId.cost);
      } else if (mpnPrice > 0) {
        unitPrice = Number(mpnPrice);
      } else if (item.unitPrice > 0) {
        unitPrice = Number(item.unitPrice);
      }

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

// @desc    Get high-density Lot Storage Ledger (Matching Blueprint Sheet 2)
// @route   GET /api/inventory/lot-ledger
// @access  Private
exports.getLotStorageLedger = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.siteId && req.query.siteId !== 'ALL') {
      filter.siteId = req.query.siteId;
    }
    if (req.query.warehouseId && req.query.warehouseId !== 'ALL') {
      filter.warehouseId = req.query.warehouseId;
    }

    const items = await InventoryItem.find(filter)
      .populate('materialId', 'name code unit type subcategory')
      .populate('warehouseId', 'name code type isDefault siteId')
      .populate('siteId', 'name code')
      .sort({ 'materialId': 1, 'expiryDate': 1 })
      .lean();

    const validItems = items.filter(i => i.materialId && i.warehouseId);

    // Fetch active MPNs to map vendors and MPN codes
    const matIds = [...new Set(validItems.map(i => i.materialId._id.toString()))];
    const mpnDocs = await MPN.find({ materialId: { $in: matIds }, status: 'Active' })
      .populate('vendorId', 'name vendorCode')
      .lean();

    const mpnByMatId = {};
    for (const m of mpnDocs) {
      const k = m.materialId.toString();
      if (!mpnByMatId[k]) {
        mpnByMatId[k] = {
          mpnCode: m.mpnCode || m.manufacturerPartNumber,
          vendorName: m.vendorId?.name || m.manufacturerName || 'Enterprise Supplier',
        };
      }
    }

    // Build detailed lot rows
    const lots = validItems.map(item => {
      const matIdStr = item.materialId._id.toString();
      const mpnInfo = mpnByMatId[matIdStr] || { mpnCode: item.materialId.code, vendorName: 'Standard Vendor' };
      const effectiveLot = item.lotNumber || (item.batchNumber !== 'DEFAULT' ? item.batchNumber : 'LOT-INITIAL');

      return {
        _id: item._id,
        materialId: item.materialId._id,
        mpn: mpnInfo.mpnCode,
        classification: item.materialId.type || 'Raw Material',
        material: item.materialId.name,
        vendor: mpnInfo.vendorName,
        location: item.siteId?.name || (item.warehouseId?.location) || 'Primary Site',
        siteCode: item.siteId?.code || 'SITE',
        wh: item.warehouseId?.code || item.warehouseId?.name,
        warehouseId: item.warehouseId?._id,
        lotNo: effectiveLot,
        mfgDate: item.mfgDate || item.createdAt,
        expDate: item.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        qty: item.onHand || item.balance || 0,
        available: item.available || 0,
        uom: item.uom || item.materialId.unit || 'kg',
      };
    });

    // Build aggregate summary by Material / MPN
    const aggMap = {};
    for (const lot of lots) {
      const key = lot.materialId.toString();
      if (!aggMap[key]) {
        aggMap[key] = {
          materialId: lot.materialId,
          mpn: lot.mpn,
          classification: lot.classification,
          material: lot.material,
          vendor: lot.vendor,
          location: 'All',
          wh: 'All',
          lotCount: 0,
          totalQty: 0,
          uom: lot.uom,
          lots: [],
        };
      }
      aggMap[key].lotCount += 1;
      aggMap[key].totalQty += lot.qty;
      aggMap[key].lots.push(lot);
    }

    const aggregates = Object.values(aggMap);

    res.status(200).json({
      success: true,
      count: lots.length,
      aggregates,
      lots,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Add Stock (Inward Entry) — Section 4 (Raw & Finished Goods)
// @route   POST /api/inventory/inward
// @access  Private
exports.inwardStock = async (req, res, next) => {
  try {
    const {
      materialId,
      siteId,
      warehouseId,
      quantity,
      lotNumber,
      mfgDate,
      expiryDate,
      reason,
      uom
    } = req.body;

    if (!materialId || !quantity || Number(quantity) <= 0) {
      return res.status(400).json({ success: false, error: 'Please provide materialId and valid quantity > 0' });
    }

    // Auto-resolve default warehouse from Location if not directly provided (Section 10 rule)
    let targetWhId = warehouseId;
    if (!targetWhId && siteId) {
      const defWh = await Warehouse.findOne({ siteId, isDefault: true, status: 'Active' })
        || await Warehouse.findOne({ siteId, status: 'Active' });
      if (defWh) targetWhId = defWh._id;
    }
    if (!targetWhId) {
      const fallbackWh = await Warehouse.findOne({ status: 'Active' });
      if (fallbackWh) targetWhId = fallbackWh._id;
    }

    if (!targetWhId) {
      return res.status(400).json({ success: false, error: 'No active warehouse found for selected location' });
    }

    const effectiveLot = lotNumber || `LOT-${Date.now()}`;
    const tx = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId: targetWhId,
      siteId: siteId || undefined,
      quantity: Number(quantity),
      type: 'GRN',
      lotNumber: effectiveLot,
      batchNumber: effectiveLot,
      mfgDate: mfgDate ? new Date(mfgDate) : new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      reason: reason || 'Initial stock inward entry',
      userId: req.user ? req.user.id : null,
      sourceDocType: 'StockInward',
      referenceId: `INW-${Date.now()}`
    });

    res.status(201).json({
      success: true,
      message: `Stock successfully added (${quantity} ${uom || 'units'}) with Lot ${effectiveLot}`,
      data: tx
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Remove Stock (Outward Entry) with Mandatory Lot Selection — Section 4
// @route   POST /api/inventory/outward
// @access  Private
exports.outwardStock = async (req, res, next) => {
  try {
    const {
      materialId,
      warehouseId,
      lotNumber,
      quantity,
      reason
    } = req.body;

    if (!materialId || !lotNumber) {
      return res.status(400).json({ success: false, error: 'Mandatory: You must select a specific Lot # during removal (FIFO tracking)' });
    }

    const removeQty = Number(quantity);
    if (!removeQty || removeQty <= 0) {
      return res.status(400).json({ success: false, error: 'Please provide a valid removal quantity > 0' });
    }

    // Verify lot exists and has sufficient stock
    const query = { materialId, $or: [{ lotNumber }, { batchNumber: lotNumber }] };
    if (warehouseId) query.warehouseId = warehouseId;
    const lotItem = await InventoryItem.findOne(query);

    if (!lotItem) {
      return res.status(404).json({ success: false, error: `Lot ${lotNumber} not found in inventory` });
    }

    if (lotItem.available < removeQty) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock in Lot ${lotNumber}. Requested: ${removeQty}, Available: ${lotItem.available}`
      });
    }

    const tx = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId: lotItem.warehouseId,
      siteId: lotItem.siteId,
      quantity: removeQty,
      type: 'Issue',
      lotNumber,
      batchNumber: lotNumber,
      reason: reason || 'Stock removal / disposal',
      userId: req.user ? req.user.id : null,
      sourceDocType: 'StockOutward',
      referenceId: `OUT-${Date.now()}`
    });

    res.status(200).json({
      success: true,
      message: `Stock successfully removed (${removeQty} units) from Lot ${lotNumber}`,
      data: tx
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get active lots for a material sorted by FIFO (expiryDate asc)
// @route   GET /api/inventory/lots-for-material/:materialId
// @access  Private
exports.getLotsForMaterial = async (req, res, next) => {
  try {
    const filter = {
      materialId: req.params.materialId,
      onHand: { $gt: 0 }
    };
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
    if (req.query.siteId) filter.siteId = req.query.siteId;

    const lots = await InventoryItem.find(filter)
      .populate('warehouseId', 'name code')
      .populate('siteId', 'name code')
      .sort({ expiryDate: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: lots.length,
      data: lots.map(l => ({
        _id: l._id,
        lotNumber: l.lotNumber || l.batchNumber,
        warehouse: l.warehouseId?.code || l.warehouseId?.name,
        warehouseId: l.warehouseId?._id,
        site: l.siteId?.name || l.siteId?.code,
        mfgDate: l.mfgDate,
        expiryDate: l.expiryDate,
        onHand: l.onHand || l.balance || 0,
        available: l.available || 0,
        uom: l.uom || 'kg'
      }))
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Transfer stock between warehouses preserving Lot #, Mfg Date, and Expiry Date
// @route   POST /api/inventory/transfer
exports.transferLotStock = async (req, res, next) => {
  try {
    const {
      materialId,
      lotNumber,
      fromWarehouseId,
      toWarehouseId,
      sourceWarehouseId,
      destinationWarehouseId,
      quantity,
      reason,
      notes
    } = req.body;

    const sourceWh = fromWarehouseId || sourceWarehouseId;
    const destWh = toWarehouseId || destinationWarehouseId;

    if (!materialId || !lotNumber || !sourceWh || !destWh || !quantity || Number(quantity) <= 0) {
      return res.status(400).json({ success: false, error: 'Please provide material, lot, source warehouse, destination warehouse, and positive quantity' });
    }

    if (String(sourceWh) === String(destWh)) {
      return res.status(400).json({ success: false, error: 'Source and Destination warehouses must be different' });
    }

    const transferQty = Number(quantity);

    // Verify origin lot
    const originItem = await InventoryItem.findOne({
      materialId,
      warehouseId: sourceWh,
      $or: [{ lotNumber }, { batchNumber: lotNumber }]
    });

    if (!originItem) {
      return res.status(404).json({ success: false, error: `Lot ${lotNumber} not found in source warehouse` });
    }

    if (originItem.available < transferQty) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock in source lot ${lotNumber}. Available: ${originItem.available}, Requested: ${transferQty}`
      });
    }

    const destinationWhDoc = await Warehouse.findById(destWh);
    if (!destinationWhDoc) {
      return res.status(404).json({ success: false, error: 'Destination warehouse not found' });
    }

    const transferRef = `TRF-${Date.now()}`;

    // 1. Debit Source Warehouse
    const txOut = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId: sourceWh,
      siteId: originItem.siteId,
      quantity: transferQty,
      type: 'Transfer',
      lotNumber,
      batchNumber: lotNumber,
      reason: reason || `Inter-warehouse transfer to ${destinationWhDoc.name}`,
      userId: req.user ? req.user.id : null,
      sourceDocType: 'StockTransfer',
      referenceId: transferRef
    });

    // 2. Credit Destination Warehouse with SAME Lot #, Mfg Date, Expiry Date
    const txIn = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId: destWh,
      siteId: destinationWhDoc.siteId,
      quantity: transferQty,
      type: 'GRN',
      lotNumber,
      batchNumber: lotNumber,
      mfgDate: originItem.mfgDate,
      expiryDate: originItem.expiryDate,
      reason: reason || `Inter-warehouse transfer from source WH`,
      userId: req.user ? req.user.id : null,
      sourceDocType: 'StockTransfer',
      referenceId: transferRef
    });

    res.status(200).json({
      success: true,
      message: `Stock transfer of ${transferQty} units of Lot ${lotNumber} completed successfully. Ref: ${transferRef}`,
      data: { transferRef, txOut, txIn }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Adjust lot stock count (physical reconciliation) or edit lot metadata
// @route   POST /api/inventory/adjust-lot
exports.adjustLotStock = async (req, res, next) => {
  try {
    const {
      materialId,
      warehouseId,
      lotNumber,
      newQuantity,
      newExpiryDate,
      newMfgDate,
      reason,
      notes
    } = req.body;

    if (!materialId || !lotNumber || !warehouseId) {
      return res.status(400).json({ success: false, error: 'Material, warehouse, and lotNumber are required' });
    }

    const item = await InventoryItem.findOne({
      materialId,
      warehouseId,
      $or: [{ lotNumber }, { batchNumber: lotNumber }]
    });

    if (!item) {
      return res.status(404).json({ success: false, error: `Lot ${lotNumber} not found in warehouse` });
    }

    // Update metadata if provided
    if (newExpiryDate) item.expiryDate = new Date(newExpiryDate);
    if (newMfgDate) item.mfgDate = new Date(newMfgDate);
    await item.save();

    let tx = null;
    // If quantity is adjusted
    if (newQuantity !== undefined && newQuantity !== null && String(newQuantity).trim() !== '') {
      const targetQty = Number(newQuantity);
      if (isNaN(targetQty) || targetQty < 0) {
        return res.status(400).json({ success: false, error: 'New quantity must be a non-negative number' });
      }

      const diff = targetQty - item.onHand;
      if (diff !== 0) {
        if (!reason) {
          return res.status(400).json({ success: false, error: 'A reason is required when adjusting stock quantities' });
        }

        if (diff > 0) {
          // Increase stock
          tx = await InventoryLedgerService.recordTransaction({
            materialId,
            warehouseId,
            siteId: item.siteId,
            quantity: diff,
            type: 'Adjustment',
            lotNumber,
            batchNumber: lotNumber,
            mfgDate: item.mfgDate,
            expiryDate: item.expiryDate,
            reason: reason || 'Physical count reconciliation (increase)',
            userId: req.user ? req.user.id : null,
            sourceDocType: 'PhysicalAudit',
            referenceId: `ADJ-${Date.now()}`
          });
        } else {
          // Decrease stock
          const decreaseQty = Math.abs(diff);
          tx = await InventoryLedgerService.recordTransaction({
            materialId,
            warehouseId,
            siteId: item.siteId,
            quantity: decreaseQty,
            type: 'Issue',
            lotNumber,
            batchNumber: lotNumber,
            reason: reason || 'Physical count reconciliation (decrease)',
            userId: req.user ? req.user.id : null,
            sourceDocType: 'PhysicalAudit',
            referenceId: `ADJ-${Date.now()}`
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Lot ${lotNumber} updated successfully.`,
      data: { item, tx }
    });
  } catch (err) {
    next(err);
  }
};
