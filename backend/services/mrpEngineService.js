const mongoose = require('mongoose');
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
const { nextSeqNumber } = require('./sequenceService');
const llmService = require('./llmService');
const PythonMRPClient = require('./pythonMRPClient');

class MRPEngineService {
  /**
   * Recursively explode BOM for a product down to raw materials with time-phasing and hierarchy.
   * Returns flat array of all required components with calculated multipliers, level, and derived requirement dates.
   */
  static async explodeBOMRecursively(productId, rootQty = 1, parentReqDate = new Date(), currentLevel = 1, visited = new Set(), parentMaterial = null) {
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
    const parentDate = parentReqDate instanceof Date ? parentReqDate : new Date(parentReqDate);

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
      const parentCumulativeQty = parentMaterial?.cumulativeQty || 1;
      const cumulativeQty = Math.round((parentCumulativeQty * compUnitQty) * 10000) / 10000;
      const totalCompQty = rootQty * compUnitQty;
      const leadTimeDays = compMat.leadTimeDays || (compMat.type === 'Raw Material' ? 7 : 3);

      // Child requirement date is the parent's requirement date minus parent's assembly/production duration
      const componentReqDate = new Date(parentDate.getTime());
      const plannedReleaseDate = new Date(componentReqDate.getTime() - (leadTimeDays * 86400000));

      const compRecord = {
        level: currentLevel,
        parentProductId: productId,
        parentMaterialId: parentMaterial ? (parentMaterial._id || parentMaterial) : productId,
        parentMaterialCode: parentMaterial ? parentMaterial.code : '',
        bomId: activeBom._id,
        bomVersion: activeBom.version || 1,
        material: compMat,
        materialId: compMatId,
        materialCode: compMat.code,
        materialName: compMat.name,
        unit: compMat.unit || comp.uom || 'pcs',
        type: compMat.type || compMat.category || 'Raw Material',
        makeOrBuy: compMat.makeOrBuy || (['Finished', 'Semi-Finished', 'Assembly'].includes(compMat.type) ? 'MAKE' : 'BUY'),
        qtyPerUnit: cumulativeQty,
        grossRequiredQty: Math.round(totalCompQty * 10000) / 10000,
        lossPercentage: lossPct,
        leadTimeDays: leadTimeDays,
        safetyStock: compMat.safetyStock || 0,
        moq: compMat.moq || 1,
        lotSize: compMat.lotSize || 1,
        requirementDate: componentReqDate,
        plannedReleaseDate: plannedReleaseDate,
      };

      exploded.push(compRecord);

      // If component is a subassembly or has its own active BOM, recursively explode
      const isSubAssembly = compMat.type === 'Semi-Finished' || compMat.type === 'Assembly' || compMat.makeOrBuy === 'MAKE';
      if (isSubAssembly) {
        compMat.cumulativeQty = cumulativeQty;
        const childExploded = await this.explodeBOMRecursively(
          compMatId,
          totalCompQty,
          plannedReleaseDate,
          currentLevel + 1,
          new Set(visited),
          compMat
        );
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
   * Pure MRP Calculation (Dry Run / Proposal Phase)
   * Evaluates BOM, time-phased inventory balances, and open supply with zero DB side effects.
   */
  static async calculateMRPProposal(params) {
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
      demandIds = [],
    } = params;

    // 1. Resolve active warehouses within scope
    let targetWarehouseIds = [];
    if (warehouseScope === 'all' && siteId) {
      const siteWarehouses = await Warehouse.find({
        siteId,
        status: { $in: ['Active', 'ACTIVE', 'active'] },
      }).select('_id').lean();
      targetWarehouseIds = siteWarehouses.map(w => w._id);
    } else if (warehouseId) {
      targetWarehouseIds = [warehouseId];
    }

    if (!productId || targetWarehouseIds.length === 0 || !targetQty || targetQty <= 0) {
      throw new Error('Invalid MRP parameters: productId, at least one active warehouse, and positive targetQty are required');
    }

    const primaryWarehouseId = warehouseId || targetWarehouseIds[0];

    // 2. Fetch Product Material
    const product = await Material.findById(productId).lean();
    if (!product) throw new Error(`Product material not found: ${productId}`);

    // 3. Fetch Active BOM
    let activeBom;
    if (bomId) {
      activeBom = await BOM.findById(bomId).populate('components.materialId').lean();
    } else {
      activeBom = await BOM.findOne({ productId, status: 'Active' }).populate('components.materialId').lean();
      if (!activeBom) {
        activeBom = await BOM.findOne({ productId, status: { $ne: 'Deleted' } }).populate('components.materialId').lean();
      }
    }

    if (!activeBom || !activeBom.components || activeBom.components.length === 0) {
      throw new Error(`No active BOM components found for product ${product.name} (${product.code})`);
    }

    const baseRequiredDate = requiredDate ? new Date(requiredDate) : new Date(Date.now() + 7 * 86400000);

    // 4. Recursive Time-Phased BOM Explosion
    const explodedComponents = await this.explodeBOMRecursively(productId, targetQty, baseRequiredDate);
    if (explodedComponents.length === 0) {
      throw new Error(`BOM explosion yielded no components for product ${product.name}`);
    }

    const uniqueMaterialIds = Array.from(new Set(explodedComponents.map(c => c.materialId.toString())));

    // 5. Query Inventory Balances (OnHand, Reserved, Available) across scoped active warehouses
    const inventoryItems = await InventoryItem.find({
      materialId: { $in: uniqueMaterialIds },
      warehouseId: { $in: targetWarehouseIds },
    }).lean();

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

    // 6. Time-Phased Open PO Supply (BUY) — Segregates Eligible Supply from Late Supply
    const openPOs = await PurchaseOrder.find({
      $or: [
        { materialId: { $in: uniqueMaterialIds }, status: { $in: ['Approved', 'Issued', 'Partially Received'] } },
        { 'materials.materialId': { $in: uniqueMaterialIds }, status: { $in: ['Approved', 'Issued', 'Partially Received'] } },
      ],
    }).lean();

    const poSupplyMap = {};
    for (const id of uniqueMaterialIds) {
      poSupplyMap[id] = { totalOpen: 0, eligible: 0, late: 0, orders: [] };
    }

    for (const po of openPOs) {
      const poExpDate = po.expectedDeliveryDate || po.deliveryDate || po.createdAt || new Date();
      const isEligible = new Date(poExpDate).getTime() <= baseRequiredDate.getTime();

      const processLine = (matId, qty, rcvd) => {
        if (!matId) return;
        const k = matId.toString();
        if (poSupplyMap[k]) {
          const remaining = Math.max(0, (qty || 0) - (rcvd || 0));
          poSupplyMap[k].totalOpen += remaining;
          if (isEligible) {
            poSupplyMap[k].eligible += remaining;
          } else {
            poSupplyMap[k].late += remaining;
          }
          poSupplyMap[k].orders.push({ poNumber: po.orderNumber, expectedDate: poExpDate, remaining, isEligible });
        }
      };

      if (po.materialId) processLine(po.materialId, po.quantity, po.receivedQuantity);
      if (po.materials && Array.isArray(po.materials)) {
        for (const item of po.materials) {
          processLine(item.materialId, item.quantity, item.receivedQuantity);
        }
      }
    }

    // 7. Time-Phased Open Production Orders (MAKE)
    const openOrders = await ProductionOrder.find({
      productId: { $in: uniqueMaterialIds },
      status: { $in: ['SCHEDULED', 'ALLOCATED', 'HARD_LOCK', 'IN_PROGRESS', 'Scheduled', 'In Production'] },
    }).lean();

    const makeSupplyMap = {};
    for (const id of uniqueMaterialIds) {
      makeSupplyMap[id] = { totalOpen: 0, eligible: 0, late: 0 };
    }
    for (const order of openOrders) {
      const k = order.productId.toString();
      if (makeSupplyMap[k]) {
        const orderExpDate = order.scheduledEndDate || order.dueDate || new Date();
        const isEligible = new Date(orderExpDate).getTime() <= baseRequiredDate.getTime();
        const remaining = Math.max(0, (order.quantity || 0) - (order.completedQuantity || 0));
        makeSupplyMap[k].totalOpen += remaining;
        if (isEligible) makeSupplyMap[k].eligible += remaining;
        else makeSupplyMap[k].late += remaining;
      }
    }

    // 8. Build Normalized Calculation Payload for Python / Native Solver
    const solverComponents = explodedComponents.map(comp => {
      const matIdStr = comp.materialId.toString();
      const isMake = comp.makeOrBuy === 'MAKE';
      const supplyData = isMake ? makeSupplyMap[matIdStr] : poSupplyMap[matIdStr];

      return {
        material_id: matIdStr,
        material_code: comp.materialCode || '',
        material_name: comp.materialName || '',
        qty_per_unit: Number(comp.qtyPerUnit || 1),
        unit: comp.unit || 'pcs',
        make_or_buy: comp.makeOrBuy || 'BUY',
        lead_time_days: comp.leadTimeDays || (isMake ? 3 : 7),
        safety_stock: comp.safetyStock || 0,
        moq: comp.moq || 1.0,
        lot_size: comp.lotSize || 1.0,
        on_hand_inventory: inventoryMap[matIdStr]?.onHand || 0,
        reserved_inventory: inventoryMap[matIdStr]?.reserved || 0,
        open_supply: supplyData?.totalOpen || 0,
        eligible_supply: supplyData?.eligible || 0,
        late_supply: supplyData?.late || 0,
        requirement_date: comp.requirementDate ? comp.requirementDate.toISOString() : baseRequiredDate.toISOString(),
        level: comp.level || 1,
        parent_material_id: comp.parentMaterialId ? comp.parentMaterialId.toString() : '',
      };
    });

    // 9. Execute Solver: Python with Canonical Native Node.js Fallback
    let candidateSchedule = null;
    let engineUsed = 'Node-MRPSolver-Native';
    try {
      const pythonPayload = {
        product_id: product._id.toString(),
        product_code: product.code || '',
        product_name: product.name || '',
        target_quantity: Number(targetQty),
        required_date: baseRequiredDate.toISOString(),
        components: solverComponents,
        algorithm_version: 'MRP-2.1',
        planning_rule_version: 'RULESET-1.4',
      };
      const pyRes = await PythonMRPClient.optimizeMRP(pythonPayload);
      if (pyRes && pyRes.success && Array.isArray(pyRes.optimal_schedule)) {
        candidateSchedule = pyRes.optimal_schedule;
        engineUsed = 'Python-MRPSolver-Native';
      }
    } catch {
      candidateSchedule = null;
    }

    if (!candidateSchedule) {
      candidateSchedule = PythonMRPClient.solveNativeFallback(
        Number(targetQty),
        baseRequiredDate.toISOString(),
        solverComponents
      );
      engineUsed = 'Node-MRPSolver-Native';
    }

    // 10. Compile Summary, Exceptions & Explainable Trace
    const exceptions = [];
    let totalShortages = 0;
    let hasShortage = false;

    const requirements = candidateSchedule.map(item => {
      const isShortage = (item.shortage_qty || 0) > 0;
      if (isShortage) {
        hasShortage = true;
        totalShortages++;
      }

      const releaseDate = new Date(item.planned_order_release_date);
      if (isShortage && releaseDate < new Date()) {
        exceptions.push({
          code: 'PAST_DUE_LEAD_TIME',
          materialId: item.material_id,
          materialName: item.material_name,
          message: `Release date (${item.planned_order_release_date}) is in the past. Expedited procurement/production required.`,
          severity: 'WARNING',
        });
      }

      if (item.shortage_reason === 'LATE_SUPPLY') {
        exceptions.push({
          code: 'LATE_SUPPLY_WARNING',
          materialId: item.material_id,
          materialName: item.material_name,
          message: `Supply exists but arrives after the requirement date (${baseRequiredDate.toISOString().split('T')[0]}).`,
          severity: 'INFO',
        });
      }

      return {
        materialId: item.material_id,
        materialCode: item.material_code,
        materialName: item.material_name,
        unit: item.unit || 'pcs',
        requiredQty: item.gross_required_qty,
        availableQty: item.available_qty,
        reservedQty: item.reserved_inventory || 0,
        onOrderQty: item.open_supply,
        netQty: item.net_required_qty,
        shortageQty: item.shortage_qty,
        suggestedLeadTimeDays: Math.round((new Date(item.requirement_date || baseRequiredDate) - releaseDate) / 86400000),
        action: item.action,
        shortageReason: item.shortage_reason || 'SUFFICIENT',
        level: item.level || 1,
        parentMaterialId: item.parent_material_id || null,
        requirementDate: item.requirement_date ? new Date(item.requirement_date) : baseRequiredDate,
        releaseDate: releaseDate,
        dueDate: baseRequiredDate,
        trace: item.trace || {},
        status: 'Pending',
      };
    });

    const inputSnapshot = {
      timestamp: new Date(),
      productId: product._id,
      productCode: product.code,
      productName: product.name,
      bomId: activeBom._id,
      bomVersion: activeBom.version || bomVersion,
      targetQty: Number(targetQty),
      requiredDate: baseRequiredDate,
      warehouseId: primaryWarehouseId,
      warehouses: targetWarehouseIds,
      components: solverComponents,
      inventoryBalances: inventoryMap,
      openSupply: { po: poSupplyMap, make: makeSupplyMap },
    };

    return {
      product,
      activeBom,
      primaryWarehouseId,
      targetWarehouseIds,
      siteId,
      targetQty: Number(targetQty),
      baseRequiredDate,
      horizonDays,
      requirements,
      exceptions,
      summary: {
        totalComponents: requirements.length,
        totalShortages,
        hasShortage,
        totalProductionPlans: 0,
        totalPurchaseRequirements: 0,
        engineUsed,
        algorithmVersion: 'MRP-2.1',
        planningRuleVersion: 'RULESET-1.4',
      },
      inputSnapshot,
      demandIds,
    };
  }

  /**
   * Authoritative Transaction Commit
   * Persists the MRP Run, Planning Requirements, Root Production Plan, and Shortage PRs.
   */
  static async commitMRPRun(proposal, meta = {}) {
    const {
      product,
      activeBom,
      primaryWarehouseId,
      targetWarehouseIds,
      siteId,
      targetQty,
      baseRequiredDate,
      horizonDays,
      requirements,
      exceptions,
      summary,
      inputSnapshot,
      demandIds,
    } = proposal;

    const { userId, idempotencyKey } = meta;

    // Check idempotency: Return existing run if key was already committed
    if (idempotencyKey) {
      const existing = await MRPRun.findOne({ idempotencyKey });
      if (existing) {
        const existingReqs = await PlanningRequirement.find({ mrpRunId: existing._id });
        const existingPlans = await ProductionPlan.find({ mrpRunId: existing._id });
        const existingPRs = await PurchaseRequirement.find({ mrpRunId: existing._id });
        return {
          success: true,
          mrpRun: existing,
          requirements: existingReqs,
          productionPlans: existingPlans,
          purchaseRequirements: existingPRs,
          summary: existing.summary,
          exceptions: existing.exceptions,
          isDuplicate: true,
        };
      }
    }

    const runNumber = await nextSeqNumber('mrpRun', 'MRP');

    // 1. Create Persistent MRPRun with immutable Input Snapshot
    const mrpRun = new MRPRun({
      runNumber,
      productId: product._id,
      bomId: activeBom._id,
      bomVersion: activeBom.version || 1,
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
      algorithmVersion: 'MRP-2.1',
      planningRuleVersion: 'RULESET-1.4',
      idempotencyKey,
      inputSnapshot,
      status: 'Completed',
      summary: {
        totalComponents: requirements.length,
        totalShortages: summary.totalShortages,
        hasShortage: summary.hasShortage,
        totalProductionPlans: 0,
        totalPurchaseRequirements: 0,
      },
      exceptions,
      executedBy: userId,
    });

    await mrpRun.save();

    // 2. Persist Planning Requirements with full trace
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

    // 3. Create Root Production Plan in UNSCHEDULED status
    const createdProductionPlans = [];
    const rootMaterialCheck = await this.checkMaterialAvailability(activeBom._id, targetQty, primaryWarehouseId);
    const planNumber = await nextSeqNumber('productionPlan', 'PLAN');

    const planIngredients = (activeBom.components || []).map(comp => {
      const compMat = comp.materialId || (comp.mpnId && comp.mpnId.materialId);
      const rawCompQty = Number(comp.quantity !== undefined ? comp.quantity : (comp.qty !== undefined ? comp.qty : 1));
      const compQtyPerBatch = rawCompQty > 0 ? rawCompQty : 1;
      const batchSize = activeBom.batchSize || 1;
      const lossPct = Number(comp.lossPercentage || comp.lossPercent || 0);
      const quantityPerPlan = Math.max(0.000001, compQtyPerBatch / batchSize);
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

    // 4. Generate Purchase Requirements for BUY components with net shortages
    const createdPurchaseReqs = [];
    for (const req of requirements) {
      if (req.action === 'Procure' || (req.shortageQty > 0 && req.action !== 'Produce')) {
        const reqNum = await nextSeqNumber('purchaseRequirement', 'PR-REQ');
        const purchaseReq = await PurchaseRequirement.create({
          requirementNumber: reqNum,
          materialId: req.materialId,
          materialCode: req.materialCode,
          materialName: req.materialName,
          quantity: Math.round(req.shortageQty * 10000) / 10000,
          unit: req.unit,
          requiredDate: req.releaseDate || baseRequiredDate,
          warehouseId: primaryWarehouseId,
          siteId,
          mrpRunId: mrpRun._id,
          sourceKey: `${mrpRun._id}_${req.materialId.toString()}`,
          status: 'OPEN',
          notes: `Auto-recommended for ${product.name} MRP Run ${mrpRun.runNumber} (${req.shortageReason})`,
          createdBy: userId || null,
        });
        createdPurchaseReqs.push(purchaseReq);
      }
    }

    mrpRun.summary.totalProductionPlans = createdProductionPlans.length;
    mrpRun.summary.totalPurchaseRequirements = createdPurchaseReqs.length;

    // Optional non-blocking AI summary
    try {
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        const shortageList = requirements
          .filter(r => r.shortageQty > 0)
          .map(r => r.materialName)
          .join(', ') || 'None';
        const promptText = `Summarize the manufacturing MRP run for ${product.name} (Qty: ${targetQty}). Components evaluated: ${requirements.length}, Shortages: ${summary.totalShortages}. Shortage materials: ${shortageList}. Provide a concise 2-sentence executive summary for the production planner.`;
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

  /**
   * Unified Orchestrator: Calculates and Commits MRP Run atomically
   */
  static async runMRP(params) {
    const proposal = await this.calculateMRPProposal(params);
    return await this.commitMRPRun(proposal, {
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
    });
  }
}

module.exports = MRPEngineService;

