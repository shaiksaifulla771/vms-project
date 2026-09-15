const mongoose = require('mongoose');

/**
 * Standard Mongoose Query Populator for ProductionPlan documents
 */
function populatePlan(query) {
  return query
    .populate('productId', 'name code unit type')
    .populate('product', 'name code unit type')
    .populate('bomId')
    .populate('bom')
    .populate('warehouseId', 'name code')
    .populate('ingredients.material', 'name code unit')
    .populate('createdBy', 'username email')
    .populate('approvedBy', 'username email')
    .populate('releasedBy', 'username email')
    .populate('completedBy', 'username email')
    .populate('releasedProductionOrderId');
}

/**
 * Pure calculation of BOM ingredients scaled to total planned quantity with scrap/loss factor
 */
function calculateBomIngredients(activeBom, totalPlans, targetWarehouseId) {
  if (!activeBom) return [];
  const batchSize = activeBom.batchSize || 1;
  return (activeBom.components || []).map(comp => {
    const compMat = comp.materialId || (comp.mpnId && comp.mpnId.materialId);
    const rawCompQty = Number(comp.quantity !== undefined ? comp.quantity : (comp.qty !== undefined ? comp.qty : 1));
    const compQty = rawCompQty > 0 ? rawCompQty : 1;
    const lossPct = Number(comp.lossPercentage || comp.lossPercent || 0);
    const quantityPerPlan = Math.max(0.000001, compQty / batchSize);
    const totalQuantity = (totalPlans * quantityPerPlan) * (1 + lossPct / 100);

    return {
      material: compMat?._id || compMat,
      materialId: compMat?._id || compMat,
      materialCode: compMat?.code || '',
      materialName: compMat?.name || '',
      quantityPerPlan: Math.round(quantityPerPlan * 10000) / 10000,
      totalQuantity: Math.round(totalQuantity * 10000) / 10000,
      uom: compMat?.unit || comp.uom || 'pcs',
      warehouse: targetWarehouseId,
      warehouseId: targetWarehouseId,
      lossPercentage: lossPct,
    };
  });
}

/**
 * Resolves custom manual ingredient definitions with material master documents
 */
async function resolveCustomIngredients(ingredients, totalPlans, targetWarehouseId, Material) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return [];
  const resolved = [];
  for (const ing of ingredients) {
    const matId = ing.materialId || ing.material;
    const matDoc = await Material.findById(matId);
    if (!matDoc) continue;
    const rawQty = Number(ing.quantityPerPlan !== undefined ? ing.quantityPerPlan : (ing.qty !== undefined ? ing.qty : 1));
    const qtyPerPlan = Math.max(0.000001, rawQty > 0 ? rawQty : 1);
    const lossPct = Number(ing.lossPercentage || 0);
    const totalQuantity = (totalPlans * qtyPerPlan) * (1 + lossPct / 100);

    resolved.push({
      material: matDoc._id,
      materialId: matDoc._id,
      materialCode: matDoc.code,
      materialName: matDoc.name,
      quantityPerPlan: Math.round(qtyPerPlan * 10000) / 10000,
      totalQuantity: Math.round(totalQuantity * 10000) / 10000,
      uom: ing.uom || matDoc.unit || 'pcs',
      warehouse: ing.warehouseId || ing.warehouse || targetWarehouseId,
      warehouseId: ing.warehouseId || ing.warehouse || targetWarehouseId,
      lossPercentage: lossPct,
    });
  }
  return resolved;
}

/**
 * Determines stock availability status across an ingredient list
 */
async function checkStockAvailability(ingredients, targetWarehouseId, InventoryItem) {
  const matIds = ingredients.map(i => i.material);
  const invQuery = { materialId: { $in: matIds } };
  if (targetWarehouseId && targetWarehouseId !== 'all' && targetWarehouseId !== 'ALL' && mongoose.Types.ObjectId.isValid(targetWarehouseId)) {
    invQuery.warehouseId = targetWarehouseId;
  }
  const invItems = await InventoryItem.find(invQuery);
  const stockMap = {};
  for (const item of invItems) {
    stockMap[item.materialId.toString()] = Math.max(0, (item.onHand || 0) - (item.reserved || 0));
  }
  const shortages = [];
  let hasShortage = false;
  let hasPartial = false;
  for (const ing of ingredients) {
    const avail = stockMap[ing.material.toString()] || 0;
    const shortageQty = Math.max(0, ing.totalQuantity - avail);
    if (shortageQty > 0) {
      hasShortage = true;
      if (avail > 0) hasPartial = true;
      shortages.push({
        material: ing.material,
        materialId: ing.material,
        materialCode: ing.materialCode,
        materialName: ing.materialName,
        requiredQty: ing.totalQuantity,
        availableQty: avail,
        shortageQty,
        unit: ing.uom,
        warehouseId: targetWarehouseId,
      });
    }
  }
  return {
    status: hasShortage ? (hasPartial ? 'PARTIAL' : 'SHORTAGE') : 'READY',
    shortages,
    components: ingredients.map(i => ({
      materialId: i.material,
      materialCode: i.materialCode,
      materialName: i.materialName,
      requiredQty: i.totalQuantity,
      availableQty: stockMap[i.material.toString()] || 0,
      shortageQty: Math.max(0, i.totalQuantity - (stockMap[i.material.toString()] || 0)),
      unit: i.uom,
    })),
    checkedAt: new Date(),
  };
}

/**
 * Non-blocking Audit Logger helper for Production Planning events
 */
async function logPlanAudit({ plan, action, req, reason, details, AuditLog }) {
  try {
    if (!AuditLog) return;
    await AuditLog.create({
      entityType: 'ProductionPlan',
      entityId: plan?._id,
      action,
      module: 'Production Planning',
      userId: req?.user?._id,
      userName: req?.user?.username || 'System User',
      role: req?.user?.role || 'Planner',
      reason: reason || `${action} on plan ${plan?.planNumber || ''}`,
      details: details || {},
      timestamp: new Date()
    });
  } catch (err) {
    // Non-blocking audit log failure
  }
}

module.exports = {
  populatePlan,
  calculateBomIngredients,
  resolveCustomIngredients,
  checkStockAvailability,
  logPlanAudit
};
