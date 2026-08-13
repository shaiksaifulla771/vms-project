const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const llmService = require('./llmService');

class MRPEngineService {
  /**
   * Run deterministic MRP calculation for a product target quantity.
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
      activeBom = await BOM.findOne({ productId }).populate('components.materialId');
    }

    if (!activeBom || !activeBom.components || activeBom.components.length === 0) {
      throw new Error(`No active BOM components found for product ${product.name} (${product.code})`);
    }

    // 2. Generate unique run number
    const runNumber = `MRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const requirements = [];
    let totalShortages = 0;
    let hasShortage = false;

    // 3. Process BOM Components (BOM Explosion)
    for (const comp of activeBom.components) {
      const mat = comp.materialId;
      if (!mat) continue;

      const compQtyPerUnit = comp.quantity || 0;
      const lossPct = comp.lossPercentage || 0;
      // Gross Requirement adjusted for scrap/loss percentage
      const grossQty = targetQty * compQtyPerUnit * (1 + lossPct / 100);

      // On-Hand & Stock Netting for this component at target warehouse
      const invItems = await InventoryItem.find({ materialId: mat._id, warehouseId });
      const availableStock = invItems.reduce((acc, i) => acc + (i.available || 0), 0);
      const reservedStock = invItems.reduce((acc, i) => acc + (i.reserved || 0), 0);

      // Fetch Open PO Supplies (Purchases on order)
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
      // Net Req = Gross Req - (Available Stock + Open POs)
      const netQty = Math.max(0, grossQty - (availableStock + onOrderQty));
      const shortageQty = netQty;

      let action = 'Sufficient';
      if (shortageQty > 0) {
        hasShortage = true;
        totalShortages++;
        if (mat.type === 'Raw Material') {
          action = availableStock > 0 ? 'Partial Stock' : 'Procure';
        } else {
          action = availableStock > 0 ? 'Partial Stock' : 'Produce';
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
        onOrderQty,
        netQty: Math.round(netQty * 10000) / 10000,
        shortageQty: Math.round(shortageQty * 10000) / 10000,
        suggestedLeadTimeDays: mat.type === 'Raw Material' ? 7 : 3,
        action,
        status: 'Pending',
      });
    }

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

    // 5. Persist Planning Requirements idempotently using sourceKey
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

    // 6. Non-mutating AI Explanation Commentary (Optional)
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
}

module.exports = MRPEngineService;
