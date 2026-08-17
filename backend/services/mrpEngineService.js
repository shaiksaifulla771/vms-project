const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const PurchaseRequirement = require('../models/PurchaseRequirement');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const MPN = require('../models/MPN');
const Site = require('../models/Site');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const Warehouse = require('../models/Warehouse');
const Sequence = require('../models/Sequence');
const llmService = require('./llmService');

// Helper: Generate next sequential number atomically
async function nextSeqNumber(key, prefix) {
  let seqDoc = await Sequence.findById(key);
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: key, seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true });
  }
  return `${prefix}-${seqDoc.seq}`;
}

class MRPEngineService {
  /**
   * Recursively explode BOM for a product down to raw materials
   * Returns flat array of all required components with calculated multipliers and level
   */
  static async explodeBOMRecursively(productId, rootQty = 1, currentLevel = 1, visited = new Set()) {
    const prodIdStr = productId.toString();
    if (visited.has(prodIdStr)) {
      // Circular reference guard
      return [];
    }
    visited.add(prodIdStr);

    const activeBom = await BOM.findOne({ productId, status: 'Active' })
      .populate('components.materialId')
      .populate('components.mpnId');

    if (!activeBom || !activeBom.components || activeBom.components.length === 0) {
      return [];
    }

    const exploded = [];
    const batchSize = activeBom.batchSize || 1;

    for (const comp of activeBom.components) {
      let compMat = comp.materialId;
      if (!compMat && comp.mpnId) {
        const mpnDoc = comp.mpnId.materialId ? comp.mpnId : await mongoose.model('MPN').findById(comp.mpnId).lean();
        if (mpnDoc && mpnDoc.materialId) {
          compMat = await Material.findById(mpnDoc.materialId).lean();
        }
      }
      if (!compMat) continue;

      const compMatId = compMat._id;
      const compQtyPerBatch = comp.quantity || comp.qty || 0;
      const lossPct = comp.lossPercentage || comp.lossPercent || 0;
      const compUnitQty = (compQtyPerBatch / batchSize) * (1 + lossPct / 100);
      const totalCompQty = rootQty * compUnitQty;

      exploded.push({
        level: currentLevel,
        parentProductId: productId,
        bomId: activeBom._id,
        bomVersion: activeBom.version || 1,
        material: compMat,
        materialId: compMatId,
        materialCode: compMat.code,
        materialName: compMat.name,
        unit: compMat.unit || comp.uom || 'pcs',
        type: compMat.type || compMat.category || 'Raw Material',
        makeOrBuy: compMat.makeOrBuy || (['Finished', 'Semi-Finished', 'Assembly'].includes(compMat.type) ? 'MAKE' : 'BUY'),
        qtyPerUnit: compUnitQty,
        grossRequiredQty: totalCompQty,
        lossPercentage: lossPct,
        leadTimeDays: compMat.leadTimeDays || (compMat.type === 'Raw Material' ? 7 : 3),
        safetyStock: compMat.safetyStock || 0,
        moq: compMat.moq || 1,
        lotSize: compMat.lotSize || 1,
      });

      // If component is a subassembly or has its own active BOM, recursively explode
      const isSubAssembly = compMat.type === 'Semi-Finished' || compMat.type === 'Assembly' || compMat.makeOrBuy === 'MAKE';
      if (isSubAssembly) {
        const childExploded = await this.explodeBOMRecursively(compMatId, totalCompQty, currentLevel + 1, new Set(visited));
        exploded.push(...childExploded);
      }
    }

    return exploded;
  }

  /**
   * Evaluate material availability for a specific BOM and target quantity
   * Used for manual plan creation, live modal check, and scheduling validation
   */
  static async checkMaterialAvailability(bomId, targetQty = 1, warehouseId = null, siteId = null, options = {}) {
    const bom = await BOM.findById(bomId).populate('components.materialId').populate('components.mpnId');
    if (!bom || !bom.components || bom.components.length === 0) {
      return { status: 'READY', shortages: [], components: [], checkedAt: new Date() };
    }

    const validComponents = [];
    for (const c of bom.components) {
      let compMat = c.materialId;
      if (!compMat && c.mpnId) {
        const mpnDoc = c.mpnId.materialId ? c.mpnId : await mongoose.model('MPN').findById(c.mpnId).lean();
        if (mpnDoc && mpnDoc.materialId) {
          compMat = await Material.findById(mpnDoc.materialId).lean();
        }
      }
      if (compMat) {
        validComponents.push({ ...c.toObject ? c.toObject() : c, materialId: compMat });
      }
    }

    if (validComponents.length === 0) {
      return { status: 'READY', shortages: [], components: [], checkedAt: new Date() };
    }

    const materialIds = validComponents.map(c => c.materialId._id || c.materialId);
    const invQuery = { materialId: { $in: materialIds } };

    // Resolve target warehouses for the facility / site
    let effectiveSiteId = siteId;

    if (warehouseId && !effectiveSiteId) {
      const whDoc = await Warehouse.findById(warehouseId).lean().catch(() => null);
      if (whDoc && whDoc.siteId) {
        effectiveSiteId = whDoc.siteId;
      }
    }

    if (options.strictWarehouse && warehouseId) {
      invQuery.warehouseId = warehouseId;
    } else if (effectiveSiteId) {
      const siteWhs = await Warehouse.find({ siteId: effectiveSiteId, status: { $ne: 'Inactive' } }).select('_id').lean();
      const whIds = siteWhs.map(w => w._id);
      if (whIds.length > 0) {
        invQuery.warehouseId = { $in: whIds };
      } else if (warehouseId) {
        invQuery.warehouseId = warehouseId;
      }
    } else if (warehouseId) {
      invQuery.warehouseId = warehouseId;
    }

    const inventoryItems = await InventoryItem.find(invQuery)
      .populate('warehouseId', 'name code')
      .populate('siteId', 'name code')
      .lean();

    const stockMap = {};
    for (const item of inventoryItems) {
      const k = item.materialId.toString();
      if (!stockMap[k]) stockMap[k] = { onHand: 0, reserved: 0, available: 0, locations: [] };
      const avail = Math.max(0, (item.onHand || 0) - (item.reserved || 0));
      stockMap[k].onHand += (item.onHand || 0);
      stockMap[k].reserved += (item.reserved || 0);
      stockMap[k].available += avail;
      if (avail > 0) {
        stockMap[k].locations.push({
          warehouseId: item.warehouseId?._id || item.warehouseId,
          warehouseName: item.warehouseId?.name || 'Warehouse',
          siteId: item.siteId?._id || item.siteId,
          siteName: item.siteId?.name || '',
          available: avail,
          onHand: item.onHand || 0,
        });
      }
    }

    const batchSize = bom.batchSize || 1;
    const shortages = [];
    const componentsSummary = [];
    let hasShortage = false;
    let hasPartial = false;

    for (const comp of validComponents) {
      const mat = comp.materialId;
      const compQty = comp.quantity || comp.qty || 1;
      const lossPct = comp.lossPercentage || comp.lossPercent || 0;
      const requiredQty = (targetQty * (compQty / batchSize)) * (1 + lossPct / 100);

      const k = mat._id.toString();
      const available = stockMap[k]?.available || 0;
      const shortageQty = Math.max(0, requiredQty - available);
      const locations = stockMap[k]?.locations || [];

      const compItem = {
        material: mat._id,
        materialId: mat._id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit || comp.uom || 'pcs',
        requiredQty: Math.round(requiredQty * 10000) / 10000,
        availableQty: Math.round(available * 10000) / 10000,
        shortageQty: Math.round(shortageQty * 10000) / 10000,
        warehouse: warehouseId || null,
        warehouseId: warehouseId || null,
        locations,
      };

      componentsSummary.push(compItem);

      if (shortageQty > 0) {
        hasShortage = true;
        if (available > 0) hasPartial = true;
        shortages.push(compItem);
      }
    }

    let status = 'READY';
    if (hasShortage) {
      status = hasPartial ? 'PARTIAL' : 'SHORTAGE';
    }

    return {
      status,
      shortages,
      components: componentsSummary,
      checkedAt: new Date(),
    };
  }

  /**
   * Run deterministic MRP calculation for target product quantity or demand snapshot
   */
  static async runMRP(params) {
    const {
      productId,
      bomId,
      bomVersion = 1,
      siteId,
      warehouseId,
      warehouseScope,
      targetQty,
      requiredDate,
      horizonDays = 30,
      userId,
      demandIds = [],
    } = params;

    // Resolve warehouse scope: 'all' = every active warehouse under the site
    let targetWarehouseIds = [];
    if (warehouseScope === 'all' && siteId) {
      const siteWarehouses = await Warehouse.find({ siteId, status: 'Active' }).select('_id').lean();
      targetWarehouseIds = siteWarehouses.map(w => w._id);
    } else if (warehouseId) {
      targetWarehouseIds = [warehouseId];
    }

    if (!productId || targetWarehouseIds.length === 0 || !targetQty || targetQty <= 0) {
      throw new Error('Invalid MRP parameters: productId, at least one warehouse (or site with warehouses), and positive targetQty are required');
    }

    // Use first warehouse as primary for backward compat
    const primaryWarehouseId = warehouseId || targetWarehouseIds[0];

    // 1. Fetch Product Material
    const product = await Material.findById(productId);
    if (!product) throw new Error(`Product material not found: ${productId}`);

    // 2. Fetch Active BOM
    let activeBom;
    if (bomId) {
      activeBom = await BOM.findById(bomId).populate('components.materialId');
    } else {
      activeBom = await BOM.findOne({ productId, status: 'Active' }).populate('components.materialId');
      if (!activeBom) {
        activeBom = await BOM.findOne({ productId, status: { $ne: 'Deleted' } }).populate('components.materialId');
      }
    }

    if (!activeBom || !activeBom.components || activeBom.components.length === 0) {
      throw new Error(`No active BOM components found for product ${product.name} (${product.code})`);
    }

    // 3. Multi-level BOM Explosion
    const explodedComponents = await this.explodeBOMRecursively(productId, targetQty);
    if (explodedComponents.length === 0) {
      throw new Error(`BOM explosion yielded no components for product ${product.name}`);
    }

    const uniqueMaterialIds = Array.from(new Set(explodedComponents.map(c => c.materialId.toString())));

    // 4. Batch Fetch Available Inventory (OnHand - Reserved)
    const inventoryItems = await InventoryItem.find({
      materialId: { $in: uniqueMaterialIds },
      warehouseId: { $in: targetWarehouseIds },
    });

    const inventoryMap = {};
    for (const id of uniqueMaterialIds) {
      inventoryMap[id] = { onHand: 0, reserved: 0, available: 0 };
    }
    for (const item of inventoryItems) {
      const key = item.materialId.toString();
      if (inventoryMap[key]) {
        inventoryMap[key].onHand += item.onHand || 0;
        inventoryMap[key].reserved += item.reserved || 0;
        inventoryMap[key].available += Math.max(0, (item.onHand || 0) - (item.reserved || 0));
      }
    }

    // 5. Batch Fetch Open PO Supply for BUY items
    const openPOs = await PurchaseOrder.find({
      $or: [
        { materialId: { $in: uniqueMaterialIds }, status: { $in: ['Approved', 'Issued', 'Partially Received'] } },
        { 'materials.materialId': { $in: uniqueMaterialIds }, status: { $in: ['Approved', 'Issued', 'Partially Received'] } },
      ],
    });

    const onOrderSupplyMap = {};
    for (const id of uniqueMaterialIds) onOrderSupplyMap[id] = 0;

    for (const po of openPOs) {
      if (po.materialId) {
        const k = po.materialId.toString();
        if (onOrderSupplyMap[k] !== undefined) {
          onOrderSupplyMap[k] += Math.max(0, (po.quantity || 0) - (po.receivedQuantity || 0));
        }
      }
      if (po.materials && Array.isArray(po.materials)) {
        for (const item of po.materials) {
          if (!item.materialId) continue;
          const k = item.materialId.toString();
          if (onOrderSupplyMap[k] !== undefined) {
            onOrderSupplyMap[k] += Math.max(0, (item.quantity || 0) - (item.receivedQuantity || 0));
          }
        }
      }
    }

    // 6. Batch Fetch Open Production Supply for MAKE items
    const openOrders = await ProductionOrder.find({
      productId: { $in: uniqueMaterialIds },
      status: { $in: ['SCHEDULED', 'ALLOCATED', 'HARD_LOCK', 'IN_PROGRESS', 'Scheduled', 'In Production'] },
    });
    const makeSupplyMap = {};
    for (const id of uniqueMaterialIds) makeSupplyMap[id] = 0;
    for (const order of openOrders) {
      const k = order.productId.toString();
      if (makeSupplyMap[k] !== undefined) {
        makeSupplyMap[k] += Math.max(0, (order.quantity || 0) - (order.completedQuantity || 0));
      }
    }

    // 7. Calculate Net Requirements with Lot Sizing and Lead Time
    const runNumber = await nextSeqNumber('mrpRun', 'MRP');
    const requirements = [];
    const createdProductionPlans = [];
    const createdPurchaseReqs = [];
    const exceptions = [];
    let totalShortages = 0;
    let hasShortage = false;

    const baseRequiredDate = requiredDate ? new Date(requiredDate) : new Date(Date.now() + 7 * 86400000);

    for (const comp of explodedComponents) {
      const matIdStr = comp.materialId.toString();
      const available = inventoryMap[matIdStr]?.available || 0;
      const openSupply = (comp.makeOrBuy === 'MAKE') ? (makeSupplyMap[matIdStr] || 0) : (onOrderSupplyMap[matIdStr] || 0);
      const grossQty = comp.grossRequiredQty;

      // Net Requirement = max(0, Gross - Available - OpenSupply + SafetyStock)
      const rawNet = grossQty - available - openSupply + (comp.safetyStock || 0);
      let netQty = Math.max(0, rawNet);

      // Apply Lot Sizing / MOQ
      if (netQty > 0) {
        if (comp.moq && netQty < comp.moq) {
          netQty = comp.moq;
        }
        if (comp.lotSize && comp.lotSize > 1) {
          netQty = Math.ceil(netQty / comp.lotSize) * comp.lotSize;
        }
      }

      const shortageQty = Math.max(0, grossQty - available - openSupply);
      if (shortageQty > 0) {
        hasShortage = true;
        totalShortages++;
      }

      const offsetDays = comp.leadTimeDays || (comp.makeOrBuy === 'MAKE' ? 3 : 7);
      const componentReqDate = new Date(baseRequiredDate.getTime() - (offsetDays * 86400000));

      let action = 'Sufficient';
      if (shortageQty > 0) {
        action = comp.makeOrBuy === 'MAKE' ? 'Produce' : 'Procure';
        if (available > 0 && available < grossQty) {
          action = 'Partial Stock';
        }
      }

      const reqRecord = {
        materialId: comp.materialId,
        materialCode: comp.materialCode,
        materialName: comp.materialName,
        unit: comp.unit,
        requiredQty: Math.round(grossQty * 10000) / 10000,
        availableQty: Math.round(available * 10000) / 10000,
        reservedQty: inventoryMap[matIdStr]?.reserved || 0,
        onOrderQty: Math.round(openSupply * 10000) / 10000,
        netQty: Math.round(netQty * 10000) / 10000,
        shortageQty: Math.round(shortageQty * 10000) / 10000,
        suggestedLeadTimeDays: offsetDays,
        action,
        status: 'Pending',
      };
      requirements.push(reqRecord);

      if (shortageQty > 0 && componentReqDate < new Date()) {
        exceptions.push({
          code: 'PAST_DUE_LEAD_TIME',
          materialId: comp.materialId,
          materialName: comp.materialName,
          message: `Required lead time (${offsetDays} days) exceeds target completion date. Expedited procurement required.`,
          severity: 'WARNING',
        });
      }
    }

    // 8. Create Persistent MRP Run
    const mrpRun = new MRPRun({
      runNumber,
      productId: product._id,
      bomId: activeBom._id,
      bomVersion: activeBom.version || bomVersion,
      siteId,
      warehouseId: primaryWarehouseId,
      warehouses: targetWarehouseIds,
      targetQty,
      requiredDate: baseRequiredDate,
      horizonDays,
      parameters: {
        demandIds,
        includeSafetyStock: true,
        applyLotSizing: true,
        multiLevel: true,
      },
      status: 'Completed',
      summary: {
        totalComponents: requirements.length,
        totalShortages,
        hasShortage,
        totalProductionPlans: 0,
        totalPurchaseRequirements: 0,
      },
      exceptions,
      executedBy: userId,
    });

    await mrpRun.save();

    // 9. Persist Planning Requirements
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

    // 10. Automatically Create ProductionPlan (UNSCHEDULED) for Root Product
    const rootMaterialCheck = await this.checkMaterialAvailability(activeBom._id, targetQty, primaryWarehouseId);
    const planNumber = await nextSeqNumber('productionPlan', 'PLAN');

    const planIngredients = (activeBom.components || []).map(comp => {
      const compMat = comp.materialId || (comp.mpnId && comp.mpnId.materialId);
      const compQtyPerBatch = comp.quantity || comp.qty || 1;
      const batchSize = activeBom.batchSize || 1;
      const lossPct = comp.lossPercentage || comp.lossPercent || 0;
      const quantityPerPlan = compQtyPerBatch / batchSize;
      const totalQuantity = (targetQty * quantityPerPlan) * (1 + lossPct / 100);

      return {
        material: compMat?._id || compMat,
        materialId: compMat?._id || compMat,
        materialCode: compMat?.code || '',
        materialName: compMat?.name || '',
        quantityPerPlan: Math.round(quantityPerPlan * 10000) / 10000,
        totalQuantity: Math.round(totalQuantity * 10000) / 10000,
        uom: compMat?.unit || comp.uom || 'pcs',
        warehouse: primaryWarehouseId,
        warehouseId: primaryWarehouseId,
        lossPercentage: lossPct,
      };
    });

    const rootPlan = await ProductionPlan.create({
      planNumber,
      planName: `MRP - ${product.code} - ${new Date().toISOString().split('T')[0]}`,
      mrpRunId: mrpRun._id,
      productId: product._id,
      product: product._id,
      productCode: product.code,
      productName: product.name,
      bomId: activeBom._id,
      bom: activeBom._id,
      bomVersion: String(activeBom.version || 1),
      warehouseId: primaryWarehouseId,
      totalPlans: targetQty,
      availablePlans: targetQty,
      releasedPlans: 0,
      reservedPlans: 0,
      completedPlans: 0,
      cancelledPlans: 0,
      ingredients: planIngredients,
      quantity: targetQty,
      originalQuantity: targetQty,
      remainingQuantity: targetQty,
      requiredDate: baseRequiredDate,
      requiredByDate: baseRequiredDate,
      status: 'UNSCHEDULED',
      planSource: 'MRP',
      source: 'MRP',
      sourceReference: mrpRun._id,
      sourceRefModel: 'MRPRun',
      priority: 'MEDIUM',
      materialStatus: rootMaterialCheck,
      createdBy: userId || null,
      notes: `Generated from MRP Run ${mrpRun.runNumber}`,
      auditHistory: [
        {
          action: 'CREATE_PLAN_FROM_MRP',
          user: userId || null,
          timestamp: new Date(),
          details: `Plan created in UNSCHEDULED status with ${targetQty} total plans from MRP run ${mrpRun.runNumber}`,
        }
      ]
    });
    createdProductionPlans.push(rootPlan);

    // 11. Automatically Generate Purchase Requirements for BUY items with shortages
    for (const comp of explodedComponents) {
      if (comp.makeOrBuy === 'BUY') {
        const matIdStr = comp.materialId.toString();
        const available = inventoryMap[matIdStr]?.available || 0;
        const openSupply = onOrderSupplyMap[matIdStr] || 0;
        const netShortage = Math.max(0, comp.grossRequiredQty - available - openSupply);

        if (netShortage > 0) {
          const reqNum = await nextSeqNumber('purchaseRequirement', 'PR-REQ');
          const purchaseReq = await PurchaseRequirement.create({
            requirementNumber: reqNum,
            materialId: comp.materialId,
            materialCode: comp.materialCode,
            materialName: comp.materialName,
            quantity: Math.round(netShortage * 10000) / 10000,
            unit: comp.unit,
            requiredDate: new Date(baseRequiredDate.getTime() - ((comp.leadTimeDays || 7) * 86400000)),
            warehouseId: primaryWarehouseId,
            siteId,
            mrpRunId: mrpRun._id,
            sourceKey: `${mrpRun._id}_${comp.materialId.toString()}`,
            status: 'OPEN',
            notes: `Auto-recommended for ${product.name} MRP Run ${mrpRun.runNumber}`,
            createdBy: userId || null,
          });
          createdPurchaseReqs.push(purchaseReq);
        }
      }
    }

    mrpRun.summary.totalProductionPlans = createdProductionPlans.length;
    mrpRun.summary.totalPurchaseRequirements = createdPurchaseReqs.length;

    // Optional non-blocking AI commentary
    try {
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        const shortageList = requirements
          .filter(r => r.shortageQty > 0)
          .map(r => r.materialName)
          .join(', ') || 'None';
        const promptText = `Summarize the manufacturing MRP run for ${product.name} (Qty: ${targetQty}). Components evaluated: ${requirements.length}, Shortages: ${totalShortages}. Shortage materials: ${shortageList}. Provide a concise 2-sentence executive summary for the production planner.`;
        mrpRun.summary.aiExplanation = await llmService.generateText(promptText);
      }
    } catch (err) {
      console.warn('[MRP] AI commentary generation skipped:', err.message);
    }

    await mrpRun.save();
    const planningDocs = await PlanningRequirement.find({ mrpRunId: mrpRun._id });

    return {
      success: true,
      mrpRun,
      requirements: planningDocs,
      productionPlans: createdProductionPlans,
      purchaseRequirements: createdPurchaseReqs,
      summary: mrpRun.summary,
      exceptions,
    };
  }
}

module.exports = MRPEngineService;

