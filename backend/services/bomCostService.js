const MPN = require('../models/MPN');
const MPNPriceHistory = require('../models/MPNPriceHistory');
const Material = require('../models/Material');

/**
 * Calculates the line cost and total cost for a BOM recipe based on an effective date.
 * Formula: lineCost = (qty × mpn.price) / (1 − lossPercent / 100)
 * 
 * @param {Array} components - Array of { mpnId, qty, lossPercent }
 * @param {Date} effectiveDate - The date to evaluate MPN prices against
 * @returns {Promise<{ componentsWithCost: Array, totalCost: Number }>}
 */
exports.calculateBomCost = async (components, effectiveDate = new Date()) => {
  if (!components || !components.length) {
    return { componentsWithCost: [], totalCost: 0 };
  }

  // Fetch all MPNs at once and populate Material to determine cost categories
  const mpnIds = components.map(c => c.mpnId);
  const mpns = await MPN.find({ _id: { $in: mpnIds } }).populate('materialId');
  
  // Fetch price history for the effective date
  // We want the most recent price change BEFORE or ON the effectiveDate
  const histories = await MPNPriceHistory.aggregate([
    { $match: { mpnId: { $in: mpnIds }, effectiveDate: { $lte: effectiveDate } } },
    { $sort: { effectiveDate: -1 } },
    {
      $group: {
        _id: '$mpnId',
        latestPrice: { $first: '$newPrice' }
      }
    }
  ]);

  const historyMap = {};
  for (const h of histories) {
    historyMap[h._id.toString()] = h.latestPrice;
  }

  // Create a map for quick lookup
  const mpnMap = {};
  for (const m of mpns) {
    mpnMap[m._id.toString()] = m;
  }

  let totalCost = 0;
  const componentsWithCost = [];
  const costBreakdown = {
    rawMaterialCost: 0,
    packagingCost: 0,
    processingCost: 0,
    overheadCost: 0
  };

  for (const comp of components) {
    const mpn = mpnMap[comp.mpnId.toString()];
    if (!mpn) {
      const err = new Error(`MPN not found for ID: ${comp.mpnId}`);
      err.status = 404;
      throw err;
    }

    // Resolve price: from history (effective date) or fallback to current mpn price
    const resolvedPrice = historyMap[mpn._id.toString()] !== undefined 
      ? historyMap[mpn._id.toString()] 
      : (mpn.price || 0);

    const qty = Number(comp.qty);
    const lossPercent = Number(comp.lossPercent || 0);

    if (qty <= 0) {
      throw new Error(`Component quantity must be greater than 0 for MPN: ${comp.mpnId}`);
    }
    
    if (lossPercent < 0 || lossPercent > 99) {
      throw new Error(`Loss percent must be between 0 and 99 for MPN: ${comp.mpnId}`);
    }

    // Formula calculation
    const lossFactor = 1 - (lossPercent / 100);
    const lineCost = (qty * resolvedPrice) / lossFactor;

    componentsWithCost.push({
      mpnId: comp.mpnId,
      qty,
      lossPercent,
      lineCost,
      resolvedPrice // Send back what price was used
    });

    totalCost += lineCost;

    // All components are treated as raw materials
    costBreakdown.rawMaterialCost += lineCost;
  }

  return { componentsWithCost, totalCost, costBreakdown };
};

/**
 * Bulk resolves costs for an array of BOMs based on their effectiveDates.
 * Used for list views to avoid N+1 queries.
 */
exports.populateBomCostsBulk = async (boms) => {
  if (!boms || !boms.length) return boms;

  // Gather all unique MPN IDs across all BOMs
  const mpnIds = new Set();
  for (const bom of boms) {
    if (bom.components) {
      for (const comp of bom.components) {
        if (comp.mpnId) {
          mpnIds.add(comp.mpnId._id ? comp.mpnId._id.toString() : comp.mpnId.toString());
        }
      }
    }
  }

  const uniqueMpnIds = Array.from(mpnIds);
  if (!uniqueMpnIds.length) return boms;

  // Fetch all current MPNs (for fallback) with materialId for type classification
  const mpns = await MPN.find({ _id: { $in: uniqueMpnIds } }).populate('materialId');
  const mpnMap = {};
  for (const m of mpns) {
    mpnMap[m._id.toString()] = m;
  }

  // Fetch all histories for these MPNs
  const histories = await MPNPriceHistory.find({ mpnId: { $in: uniqueMpnIds } }).sort({ effectiveDate: -1 }).lean();

  // Process each BOM
  for (const bom of boms) {
    let liveTotalCost = 0;
    const breakdown = {
      rawMaterialCost: 0,
      packagingCost: bom.packagingCost || 0,
      processingCost: bom.processingCost || 0,
      overheadCost: bom.overheadCost || 0
    };
    const bDate = bom.effectiveDate ? new Date(bom.effectiveDate) : new Date(bom.createdAt || Date.now());

    if (bom.components && Array.isArray(bom.components)) {
      for (const comp of bom.components) {
        if (!comp.mpnId) continue;
        const cId = comp.mpnId._id ? comp.mpnId._id.toString() : comp.mpnId.toString();
        const mpn = mpnMap[cId];
        
        let resolvedPrice = 0;
        
        // Find first history entry <= bDate
        const hEntry = histories.find(h => h.mpnId.toString() === cId && new Date(h.effectiveDate) <= bDate);
        if (hEntry) {
          resolvedPrice = hEntry.newPrice;
        } else if (mpn) {
          resolvedPrice = mpn.price;
        }

        if (resolvedPrice > 0) {
          const qty = Number(comp.qty) || 0;
          const loss = Number(comp.lossPercent) || 0;
          const lossFactor = 1 - (loss / 100);
          if (lossFactor > 0) {
            comp.liveLineCost = (qty * resolvedPrice) / lossFactor;
            comp.resolvedPrice = resolvedPrice;
            liveTotalCost += comp.liveLineCost;
            
            // All components are treated as Raw Material Cost
            breakdown.rawMaterialCost += comp.liveLineCost;
          } else {
            comp.liveLineCost = 0;
          }
        } else {
          comp.liveLineCost = 0;
        }
      }
    }
    
    bom.liveTotalCost = breakdown.rawMaterialCost + breakdown.packagingCost + breakdown.processingCost + breakdown.overheadCost;
    bom.breakdown = breakdown;
  }

  return boms;
};
