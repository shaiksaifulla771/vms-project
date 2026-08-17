const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const llmService = require('./llmService');

class MRPEngineService {
  /**
   * Run deterministic MRP calculation for a product target quantity.
   * Performs single-level BOM explosion with batched DB queries for performance.
   */
  static async runMRP(params) {
    const {
      productId,
      bomId,
      bomVersion = 1,
      siteId,
      warehouseId,
      targetQty,
      requiredDate,
      userId,
    } = params;

    if (!productId || !warehouseId || !targetQty || targetQty <= 0) {
      throw new Error('Invalid MRP parameters: productId, warehouseId, and positive targetQty are required');
    }

    // 1. Fetch Product & BOM
    const product = await Material.findById(productId);
    if (!product) throw new Error(`Product material not found: ${productId}`);

    let activeBom;
    if (bomId) {
      activeBom = await BOM.findById(bomId).populate('components.materialId');
    } else {
      activeBom = await BOM.findOne({ productId, status: 'Active' }).populate('components.materialId');
      if (!activeBom) {
        // Fallback to any non-deleted BOM
        activeBom = await BOM.findOne({ productId, status: { $ne: 'Deleted' } }).populate('components.materialId');
      }
    }

    if (!activeBom || !activeBom.components || activeBom.components.length === 0) {
      throw new Error(`No active BOM components found for product ${product.name} (${product.code})`);
    }

    // 2. Collect all component material IDs for batch queries
    const validComponents = activeBom.components.filter(c => c.materialId);
    if (validComponents.length === 0) {
      throw new Error(`BOM has no valid material components for product ${product.name}`);
    }
    const materialIds = validComponents.map(c => c.materialId._id);

    // 3. Batch fetch inventory for ALL components at once (N queries → 1)
    const inventoryItems = await InventoryItem.find({
      materialId: { $in: materialIds },
      warehouseId,
    });

    // Index inventory by materialId string for O(1) lookup
    const inventoryMap = {};
    for (const item of inventoryItems) {
      const key = item.materialId.toString();
      if (!inventoryMap[key]) {
        inventoryMap[key] = { available: 0, reserved: 0 };
      }
      inventoryMap[key].available += item.available || 0;
      inventoryMap[key].reserved += item.reserved || 0;
    }

    // 4. Batch fetch open POs for ALL components at once (N queries → 1)
    const openPOs = await PurchaseOrder.find({
      $or: [
        { materialId: { $in: materialIds }, status: { $in: ['Approved', 'Issued', 'Partially Received'] } },
        { 'materials.materialId': { $in: materialIds }, status: { $in: ['Approved', 'Issued', 'Partially Received'] } },
      ],
    });

    // Build on-order quantity map from POs
    const onOrderMap = {};
    for (const materialId of materialIds) {
      onOrderMap[materialId.toString()] = 0;
    }
    for (const po of openPOs) {
      if (po.materialId) {
        const key = po.materialId.toString();
        if (onOrderMap[key] !== undefined) {
          onOrderMap[key] += (po.quantity || 0) - (po.receivedQuantity || 0);
        }
      }
      if (po.materials && Array.isArray(po.materials)) {
        for (const item of po.materials) {
          if (!item.materialId) continue;
          const key = item.materialId.toString();
          if (onOrderMap[key] !== undefined) {
            onOrderMap[key] += (item.quantity || 0) - (item.receivedQuantity || 0);
          }
        }
      }
    }

    // 5. Process all BOM components (now pure in-memory, no per-component queries)
    const runNumber = `MRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const requirements = [];
    let totalShortages = 0;
    let hasShortage = false;

    for (const comp of validComponents) {
      const mat = comp.materialId;

      const compQtyPerUnit = comp.quantity || 0;
      const lossPct = comp.lossPercentage || 0;
      const grossQty = targetQty * compQtyPerUnit * (1 + lossPct / 100);

      const matKey = mat._id.toString();
      const stockInfo = inventoryMap[matKey] || { available: 0, reserved: 0 };
      const availableStock = stockInfo.available;
      const reservedStock = stockInfo.reserved;
      const onOrderQty = Math.max(0, onOrderMap[matKey] || 0);

      // Net Requirement = Gross Req - (Available Stock + On-Order Supply)
      const netQty = Math.max(0, grossQty - (availableStock + onOrderQty));
      const shortageQty = netQty;

      let action = 'Sufficient';
      if (shortageQty > 0) {
        hasShortage = true;
        totalShortages++;
        // Raw Material and Packaged Material → procure; everything else (Semi-Finished, Finished, Assembly) → produce
        const isProcurable = mat.type === 'Raw Material' || mat.type === 'Packaged Material';
        action = isProcurable ? 'Procure' : 'Produce';
        if (availableStock > 0 && availableStock < grossQty) {
          action = 'Partial Stock';
        }
      }

      requirements.push({
        materialId: mat._id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit || comp.uom || 'pcs',
        requiredQty: Math.round(grossQty * 10000) / 10000,
        availableQty: availableStock,
        reservedQty: reservedStock,
        onOrderQty: Math.round(onOrderQty * 10000) / 10000,
        netQty: Math.round(netQty * 10000) / 10000,
        shortageQty: Math.round(shortageQty * 10000) / 10000,
        suggestedLeadTimeDays: mat.type === 'Raw Material' || mat.type === 'Packaged Material' ? 7 : 3,
        action,
        status: 'Pending',
      });
    }

    // 6. Create Persistent MRP Run Document
    const mrpRun = new MRPRun({
      runNumber,
      productId: product._id,
      bomId: activeBom._id,
      bomVersion: activeBom.version || bomVersion,
      siteId,
      warehouseId,
      targetQty,
      requiredDate: requiredDate || new Date(Date.now() + 7 * 86400000),
      status: 'Completed',
      summary: {
        totalComponents: requirements.length,
        totalShortages,
        hasShortage,
      },
      executedBy: userId,
    });

    await mrpRun.save();

    // 7. Persist Planning Requirements idempotently using sourceKey
    const planningOps = requirements.map(req => ({
      updateOne: {
        filter: { sourceKey: `${mrpRun._id}_${req.materialId.toString()}` },
        update: {
          $set: {
            mrpRunId: mrpRun._id,
            sourceKey: `${mrpRun._id}_${req.materialId.toString()}`,
            ...req,
          },
        },
        upsert: true,
      },
    }));
    await PlanningRequirement.bulkWrite(planningOps);

    const planningDocs = await PlanningRequirement.find({ mrpRunId: mrpRun._id });

    // 8. Non-mutating AI Commentary (optional — does not affect calculation correctness)
    try {
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        const shortageList = requirements
          .filter(r => r.shortageQty > 0)
          .map(r => r.materialName)
          .join(', ') || 'None';
        const promptText = `Summarize the manufacturing MRP run for ${product.name} (Qty: ${targetQty}). Total components: ${requirements.length}, Shortages: ${totalShortages}. Shortage materials: ${shortageList}. Provide a concise 2-sentence executive summary for the production manager.`;
        mrpRun.summary.aiExplanation = await llmService.generateText(promptText);
        await mrpRun.save();
      }
    } catch (err) {
      console.warn('[MRP] AI commentary generation skipped:', err.message);
    }

    return {
      success: true,
      mrpRun,
      requirements: planningDocs,
      summary: mrpRun.summary,
    };
  }
}

module.exports = MRPEngineService;
