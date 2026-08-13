const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionPlan = require('../models/ProductionPlan');
const PurchaseRequest = require('../models/PurchaseRequest');
const llmService = require('./llmService');

class MRPEngineService {
  /**
   * Helper function for Multi-Level Recursive BOM Netting & Explosion
   */
  static async explodeComponent(mat, qtyNeeded, warehouseId, level = 1, requirementsMap = new Map()) {
    if (!mat) return;

    // Check if component is a Sub-Assembly with its own active BOM
    const subBom = await BOM.findOne({ productId: mat._id }).populate('components.materialId');

    // On-Hand & Stock Netting for component at target warehouse
    const invItems = await InventoryItem.find({ materialId: mat._id, warehouseId });
    const availableStock = invItems.reduce((acc, i) => acc + (i.available || 0), 0);
    const reservedStock = invItems.reduce((acc, i) => acc + (i.reserved || 0), 0);

    // Fetch Open Approved PO Supplies
    const openPOs = await PurchaseOrder.find({
      $or: [
        { materialId: mat._id },
        { 'materials.materialId': mat._id }
      ],
      status: { $in: ['Approved', 'Issued', 'Partially Received'] }
    });

    const onOrderQty = openPOs.reduce((acc, po) => {
      if (po.materialId && po.materialId.toString() === mat._id.toString()) {
        return acc + ((po.quantity || 0) - (po.receivedQuantity || 0));
      }
      if (po.materials && Array.isArray(po.materials)) {
        const item = po.materials.find(m => m.materialId && m.materialId.toString() === mat._id.toString());
        if (item) {
          return acc + ((item.quantity || 0) - (item.receivedQuantity || 0));
        }
      }
      return acc;
    }, 0);

    // Net Requirement Calculation
    const netQty = Math.max(0, qtyNeeded - (availableStock + onOrderQty));
    const shortageQty = netQty;

    let action = 'Sufficient';
    if (shortageQty > 0) {
      if (mat.type === 'Raw Material' || !subBom) {
        action = availableStock > 0 ? 'Partial Stock' : 'Procure';
      } else {
        action = availableStock > 0 ? 'Partial Stock' : 'Produce';
      }
    }

    const key = mat._id.toString();
    if (requirementsMap.has(key)) {
      const existing = requirementsMap.get(key);
      existing.requiredQty += qtyNeeded;
      existing.netQty = Math.max(0, existing.requiredQty - (existing.availableQty + existing.onOrderQty));
      existing.shortageQty = existing.netQty;
      existing.action = existing.shortageQty > 0 ? (mat.type === 'Raw Material' || !subBom ? 'Procure' : 'Produce') : 'Sufficient';
    } else {
      requirementsMap.set(key, {
        materialId: mat._id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit || 'pcs',
        bomLevel: level,
        requiredQty: Math.round(qtyNeeded * 10000) / 10000,
        availableQty: availableStock,
        reservedQty: reservedStock,
        onOrderQty,
        netQty: Math.round(netQty * 10000) / 10000,
        shortageQty: Math.round(shortageQty * 10000) / 10000,
        suggestedLeadTimeDays: mat.type === 'Raw Material' ? 7 : 3,
        action,
        status: 'Pending',
      });
    }

    // If sub-assembly has shortages, explode sub-components
    if (subBom && subBom.components && subBom.components.length > 0 && shortageQty > 0) {
      for (const subComp of subBom.components) {
        if (!subComp.materialId) continue;
        const subQtyPerUnit = subComp.quantity || 0;
        const subLossPct = subComp.lossPercentage || 0;
        const subNeeded = shortageQty * subQtyPerUnit * (1 + subLossPct / 100);
        await MRPEngineService.explodeComponent(subComp.materialId, subNeeded, warehouseId, level + 1, requirementsMap);
      }
    }
  }

  /**
   * Run deterministic Multi-Level MRP calculation for a product target quantity.
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

    // 1. Fetch Product & Active BOM
    const product = await Material.findById(productId);
    if (!product) throw new Error(`Product material not found: ${productId}`);

    let activeBom;
    if (bomId) {
      activeBom = await BOM.findById(bomId).populate('components.materialId');
    } else {
      activeBom = await BOM.findOne({ productId }).populate('components.materialId');
    }

    if (!activeBom || !activeBom.components || activeBom.components.length === 0) {
      throw new Error(`No active BOM components found for product ${product.name} (${product.code})`);
    }

    // 2. Generate unique run number
    const runNumber = `MRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const requirementsMap = new Map();

    // 3. Perform Multi-Level BOM Netting & Explosion
    for (const comp of activeBom.components) {
      const mat = comp.materialId;
      if (!mat) continue;

      const compQtyPerUnit = comp.quantity || 0;
      const lossPct = comp.lossPercentage || 0;
      const grossQty = targetQty * compQtyPerUnit * (1 + lossPct / 100);

      await MRPEngineService.explodeComponent(mat, grossQty, warehouseId, 1, requirementsMap);
    }

    const requirements = Array.from(requirementsMap.values());
    let totalShortages = 0;
    let hasShortage = false;

    requirements.forEach(req => {
      if (req.shortageQty > 0) {
        hasShortage = true;
        totalShortages++;
      }
    });

    // 4. Create Persistent MRP Run Document
    const mrpRun = new MRPRun({
      runNumber,
      productId: product._id,
      bomId: activeBom._id,
      bomVersion,
      siteId,
      warehouseId,
      targetQty,
      requiredDate,
      status: 'Completed',
      summary: {
        totalComponents: requirements.length,
        totalShortages,
        hasShortage,
      },
      executedBy: userId,
    });

    await mrpRun.save();

    // 5. Persist Planning Requirements idempotently
    const planningDocs = [];
    for (const req of requirements) {
      const sourceKey = `${mrpRun._id}_${req.materialId.toString()}`;
      const doc = await PlanningRequirement.findOneAndUpdate(
        { sourceKey },
        {
          mrpRunId: mrpRun._id,
          sourceKey,
          ...req,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      planningDocs.push(doc);
    }

    // 6. Non-mutating AI Executive Rationale Commentary
    let aiExplanation = '';
    try {
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        const promptText = `Summarize the manufacturing MRP run for ${product.name} (Qty: ${targetQty}). Total components: ${requirements.length}, Shortages: ${totalShortages}. Key shortage materials: ${requirements.filter(r => r.shortageQty > 0).map(r => r.materialName).join(', ') || 'None'}. Provide a concise 2-sentence executive summary for the production manager.`;
        aiExplanation = await llmService.generateText(promptText);
        mrpRun.summary.aiExplanation = aiExplanation;
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

  /**
   * Bulk conversion of all pending shortages in an MRP run to POs & Production Plans
   */
  static async bulkConvertShortages(mrpRunId, userId = null) {
    const mrpRun = await MRPRun.findById(mrpRunId);
    if (!mrpRun) throw new Error('MRP Run not found');

    const requirements = await PlanningRequirement.find({ mrpRunId, shortageQty: { $gt: 0 }, status: 'Pending' });
    const convertedDocs = [];

    for (const reqDoc of requirements) {
      if (reqDoc.action === 'Produce') {
        const planCount = await ProductionPlan.countDocuments();
        const planNumber = `PLAN-${Date.now()}-${planCount + 1}`;
        const plan = await ProductionPlan.create({
          planNumber,
          productId: reqDoc.materialId,
          bomId: mrpRun.bomId,
          warehouseId: mrpRun.warehouseId,
          quantity: reqDoc.shortageQty,
          requiredDate: mrpRun.requiredDate,
          status: 'Unscheduled',
          createdBy: userId || mrpRun.executedBy,
        });
        reqDoc.status = 'Converted To Plan';
        await reqDoc.save();
        convertedDocs.push({ type: 'ProductionPlan', doc: plan });
      } else {
        const prCount = await PurchaseRequest.countDocuments();
        const requestNumber = `PR-${Date.now()}-${prCount + 1}`;
        const purchaseReq = await PurchaseRequest.create({
          requestNumber,
          title: `MRP Auto-Requisition: ${reqDoc.materialName}`,
          amount: Math.round((reqDoc.shortageQty || reqDoc.requiredQty || 1) * 100),
          materialId: reqDoc.materialId,
          quantity: reqDoc.shortageQty,
          requiredDate: mrpRun.requiredDate,
          warehouseId: mrpRun.warehouseId,
          status: 'Pending',
          requestedBy: userId || mrpRun.executedBy,
          notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
        });
        reqDoc.status = 'Converted To PO';
        await reqDoc.save();
        convertedDocs.push({ type: 'PurchaseRequest', doc: purchaseReq });
      }
    }

    return { success: true, count: convertedDocs.length, converted: convertedDocs };
  }
}

module.exports = MRPEngineService;
