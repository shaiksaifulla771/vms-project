const BOM = require('../models/BOM');
const FlatBOM = require('../models/FlatBOM');
const cacheService = require('./cacheService');

class BOMExplosionService {
  /**
   * Explodes and flattens a BOM tree recursively with cycle protection.
   * @param {string|ObjectId} bomId 
   * @param {number} level 
   * @param {Set} visited 
   * @param {number} parentMultiplier 
   * @returns {Promise<Array>} List of flattened component nodes
   */
  async explodeBOM(bomId, level = 1, visited = new Set(), parentMultiplier = 1) {
    if (visited.has(bomId.toString())) {
      console.warn(`[BOMExplosion] Recursive loop detected at BOM ${bomId}`);
      return [];
    }
    visited.add(bomId.toString());

    const bom = await BOM.findById(bomId)
      .populate('components.materialId', 'name code unit type basePrice standardCost')
      .populate('components.mpnId', 'mpnCode price priceUOM')
      .lean();

    if (!bom || !bom.components) return [];

    const nodes = [];
    const batchSize = bom.batchSize || 1;

    for (const comp of bom.components) {
      if (!comp.materialId) continue;

      const mat = comp.materialId;
      const mpn = comp.mpnId;
      const baseQty = comp.quantity || comp.qty || 0;
      const effectiveQty = (baseQty * parentMultiplier) / (level === 1 ? 1 : batchSize);
      const lossPct = comp.lossPercentage || comp.lossPercent || 0;
      const unitCost = mpn?.price || mat.basePrice || mat.standardCost || 0;
      const lineCost = effectiveQty * (1 + lossPct / 100) * unitCost;

      // Check if this component is a semi-finished good with its own active BOM
      const subBom = await BOM.findOne({
        productId: mat._id,
        status: 'Active'
      }).select('_id batchSize batchUOM').lean();

      const isSubassembly = !!subBom;

      nodes.push({
        level,
        materialId: mat._id,
        mpnId: mpn?._id || null,
        materialCode: mat.code || '',
        materialName: mat.name || '',
        materialType: mat.type || 'Raw Material',
        quantity: Math.round(effectiveQty * 10000) / 10000,
        unit: comp.uom || mat.unit || 'pcs',
        lossPercentage: lossPct,
        unitCost,
        lineCost: Math.round(lineCost * 100) / 100,
        isSubassembly,
        subassemblyBomId: subBom?._id || null,
        parentMaterialId: bom.productId
      });

      // Recurse if subassembly
      if (isSubassembly && level < 5) {
        const childNodes = await this.explodeBOM(
          subBom._id,
          level + 1,
          new Set(visited),
          effectiveQty
        );
        nodes.push(...childNodes);
      }
    }

    return nodes;
  }

  /**
   * Precomputes and persists FlatBOM record for high performance.
   * @param {string|ObjectId} bomId 
   */
  async syncFlatBOM(bomId) {
    try {
      const bom = await BOM.findById(bomId).lean();
      if (!bom) return null;

      const nodes = await this.explodeBOM(bomId);
      const totalCost = nodes.reduce((sum, n) => sum + (n.lineCost || 0), 0) + (bom.packagingCost || 0) + (bom.processingCost || 0) + (bom.overheadCost || 0);
      const batchSize = bom.batchSize || 1;
      const costPerUnit = totalCost / batchSize;

      const flatDoc = await FlatBOM.findOneAndUpdate(
        { bomId: bom._id },
        {
          productId: bom.productId,
          batchSize: bom.batchSize,
          batchUOM: bom.batchUOM,
          nodes,
          totalCost: Math.round(totalCost * 100) / 100,
          costPerUnit: Math.round(costPerUnit * 10000) / 10000,
          calculatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Invalidate Redis cache
      await cacheService.del(`boms:explosion:${bomId}`);
      await cacheService.invalidatePattern('boms:*');

      return flatDoc;
    } catch (err) {
      console.error(`[BOMExplosion] syncFlatBOM error on ${bomId}:`, err.message);
      return null;
    }
  }

  /**
   * Retrieves exploded tree using cache or precomputed FlatBOM.
   * @param {string|ObjectId} bomId 
   */
  async getExplosion(bomId) {
    const cacheKey = `boms:explosion:${bomId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    let flatBOM = await FlatBOM.findOne({ bomId }).lean();
    if (!flatBOM) {
      flatBOM = await this.syncFlatBOM(bomId);
    }

    if (flatBOM) {
      await cacheService.set(cacheKey, flatBOM, 300); // 5 min TTL
    }
    return flatBOM;
  }
}

module.exports = new BOMExplosionService();
