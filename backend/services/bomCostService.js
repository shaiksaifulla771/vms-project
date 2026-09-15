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
    return { componentsWithCost: [], totalCost: 0, costBreakdown: { rawMaterialCost: 0, packagingCost: 0, processingCost: 0, overheadCost: 0 } };
  }

  // 1. Gather all MPN IDs and direct Material IDs
  const mpnIds = components.map(c => c.mpnId?._id || c.mpnId).filter(Boolean);
  const materialIds = components.map(c => c.materialId?._id || c.materialId).filter(Boolean);

  const [mpns, materials] = await Promise.all([
    MPN.find({ _id: { $in: mpnIds } }).populate('materialId'),
    Material.find({ _id: { $in: materialIds } })
  ]);
  
  // Fetch price history for the effective date for MPNs
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

  // Create maps for quick lookup
  const mpnMap = {};
  for (const m of mpns) {
    mpnMap[m._id.toString()] = m;
  }

  const matMap = {};
  for (const mat of materials) {
    matMap[mat._id.toString()] = mat;
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
    const rawMpnId = comp.mpnId?._id ? comp.mpnId._id.toString() : (comp.mpnId ? comp.mpnId.toString() : null);
    const rawMatId = comp.materialId?._id ? comp.materialId._id.toString() : (comp.materialId ? comp.materialId.toString() : null);

    const mpn = rawMpnId ? mpnMap[rawMpnId] : null;
    const mat = (mpn && (mpn.materialId?._id || mpn.materialId))
      ? (mpn.materialId._id ? mpn.materialId : matMap[mpn.materialId.toString()])
      : (rawMatId ? matMap[rawMatId] : null);

    let resolvedPrice = 0;
    if (mpn) {
      resolvedPrice = historyMap[mpn._id.toString()] !== undefined 
        ? historyMap[mpn._id.toString()] 
        : (mpn.price || 0);
    } else if (mat) {
      resolvedPrice = mat.basePrice || 0;
    }

    const qty = Number(comp.qty !== undefined ? comp.qty : (comp.quantity || 1));
    const lossPercent = Number(comp.lossPercent !== undefined ? comp.lossPercent : (comp.lossPercentage || 0));

    if (qty <= 0) {
      throw new Error(`Component quantity must be greater than 0`);
    }
    
    if (lossPercent < 0 || lossPercent > 99) {
      throw new Error(`Loss percent must be between 0 and 99`);
    }

    // Formula calculation
    const lossFactor = 1 - (lossPercent / 100);
    const lineCost = lossFactor > 0 ? (qty * resolvedPrice) / lossFactor : 0;

    componentsWithCost.push({
      materialId: mat?._id || comp.materialId,
      mpnId: mpn?._id || comp.mpnId || undefined,
      qty,
      quantity: qty,
      lossPercent,
      lossPercentage: lossPercent,
      lineCost,
      resolvedPrice // Send back what price was used
    });

    totalCost += lineCost;
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

  // Gather all unique MPN IDs and Material IDs across all BOMs
  const mpnIds = new Set();
  const matIds = new Set();

  for (const bom of boms) {
    if (bom.components) {
      for (const comp of bom.components) {
        if (comp.mpnId) {
          mpnIds.add(comp.mpnId._id ? comp.mpnId._id.toString() : comp.mpnId.toString());
        }
        if (comp.materialId) {
          matIds.add(comp.materialId._id ? comp.materialId._id.toString() : comp.materialId.toString());
        }
      }
    }
  }

  const uniqueMpnIds = Array.from(mpnIds);
  const uniqueMatIds = Array.from(matIds);

  const [mpns, materials, histories] = await Promise.all([
    uniqueMpnIds.length ? MPN.find({ _id: { $in: uniqueMpnIds } }).populate('materialId') : [],
    uniqueMatIds.length ? Material.find({ _id: { $in: uniqueMatIds } }) : [],
    uniqueMpnIds.length ? MPNPriceHistory.find({ mpnId: { $in: uniqueMpnIds } }).sort({ effectiveDate: -1 }).lean() : []
  ]);

  const mpnMap = {};
  for (const m of mpns) {
    mpnMap[m._id.toString()] = m;
  }

  const matMap = {};
  for (const mat of materials) {
    matMap[mat._id.toString()] = mat;
  }

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
        const cMpnId = comp.mpnId ? (comp.mpnId._id ? comp.mpnId._id.toString() : comp.mpnId.toString()) : null;
        const cMatId = comp.materialId ? (comp.materialId._id ? comp.materialId._id.toString() : comp.materialId.toString()) : null;

        const mpn = cMpnId ? mpnMap[cMpnId] : null;
        const mat = (mpn && mpn.materialId) ? mpn.materialId : (cMatId ? matMap[cMatId] : null);

        let resolvedPrice = 0;
        if (cMpnId) {
          const hEntry = histories.find(h => h.mpnId.toString() === cMpnId && new Date(h.effectiveDate) <= bDate);
          if (hEntry) {
            resolvedPrice = hEntry.newPrice;
          } else if (mpn) {
            resolvedPrice = mpn.price;
          }
        } else if (mat) {
          resolvedPrice = mat.basePrice || 0;
        }

        const qty = Number(comp.qty !== undefined ? comp.qty : (comp.quantity || 0));
        const loss = Number(comp.lossPercent !== undefined ? comp.lossPercent : (comp.lossPercentage || 0));
        const lossFactor = 1 - (loss / 100);

        if (resolvedPrice > 0 && lossFactor > 0) {
          comp.liveLineCost = (qty * resolvedPrice) / lossFactor;
          comp.resolvedPrice = resolvedPrice;
          liveTotalCost += comp.liveLineCost;
          breakdown.rawMaterialCost += comp.liveLineCost;
        } else {
          comp.liveLineCost = 0;
          comp.resolvedPrice = resolvedPrice;
        }
      }
    }
    
    bom.liveTotalCost = breakdown.rawMaterialCost + breakdown.packagingCost + breakdown.processingCost + breakdown.overheadCost;
    bom.breakdown = breakdown;
  }

  return boms;
};
