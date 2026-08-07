const BOM = require('../models/BOM');
const Material = require('../models/Material');

/**
 * Traverses the BOM dependency graph to detect multi-level circular dependencies.
 * @param {string} targetProductId - The _id of the product whose BOM is being created/updated.
 * @param {Array} proposedComponentMaterialIds - Array of string material IDs that this BOM will depend on.
 * @param {string|null} currentBomId - The _id of the current BOM (if updating) to exclude self.
 * @returns {Promise<{ hasCycle: boolean, cyclePath: string[]|null, cycleNames: string[]|null }>}
 */
const detectCycle = async (targetProductId, proposedComponentMaterialIds, currentBomId = null) => {
  const targetIdStr = targetProductId.toString();

  // 1. Direct self-reference check
  for (const compMatId of proposedComponentMaterialIds) {
    if (compMatId === targetIdStr) {
      const targetMat = await Material.findById(targetProductId);
      const name = targetMat ? targetMat.name : targetIdStr;
      return {
        hasCycle: true,
        cyclePath: [targetIdStr, targetIdStr],
        cycleNames: [name, name]
      };
    }
  }

  // 2. Multi-level Graph Traversal (DFS)
  const visited = new Set();

  const dfs = async (currentIdStr, path) => {
    visited.add(currentIdStr);

    const query = {
      productId: currentIdStr,
      status: { $ne: 'Deleted' }
    };
    if (currentBomId) {
      query._id = { $ne: currentBomId };
    }

    // In V2, BOM components reference mpnId. We need to populate to get materialId.
    const bomDoc = await BOM.findOne(query).populate({
      path: 'components.mpnId',
      select: 'materialId'
    });

    if (!bomDoc || !Array.isArray(bomDoc.components)) {
      return null;
    }

    for (const childComp of bomDoc.components) {
      if (!childComp.mpnId || !childComp.mpnId.materialId) continue;
      const childIdStr = childComp.mpnId.materialId.toString();

      if (childIdStr === targetIdStr) {
        return [...path, childIdStr];
      }

      if (!visited.has(childIdStr)) {
        const result = await dfs(childIdStr, [...path, childIdStr]);
        if (result) return result;
      }
    }

    return null;
  };

  for (const startIdStr of proposedComponentMaterialIds) {
    const cyclePath = await dfs(startIdStr, [targetIdStr, startIdStr]);

    if (cyclePath) {
      // Resolve material names for human-readable error output
      const materials = await Material.find({ _id: { $in: cyclePath } });
      const matMap = new Map(materials.map(m => [m._id.toString(), m.name || m.code || m._id.toString()]));
      const cycleNames = cyclePath.map(id => matMap.get(id) || id);

      return {
        hasCycle: true,
        cyclePath,
        cycleNames
      };
    }
  }

  return { hasCycle: false, cyclePath: null, cycleNames: null };
};

module.exports = {
  detectCycle
};
