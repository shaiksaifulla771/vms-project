const MRPEngineService = require('../services/mrpEngineService');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const ProductionPlan = require('../models/ProductionPlan');
const PurchaseRequest = require('../models/PurchaseRequest');

// POST /api/mrp/run — Trigger a new MRP calculation run
exports.executeMRPRun = async (req, res) => {
  try {
    const { productId, bomId, bomVersion, siteId, warehouseId, targetQty, requiredDate } = req.body;
    
    const result = await MRPEngineService.runMRP({
      productId,
      bomId,
      bomVersion,
      siteId,
      warehouseId,
      targetQty,
      requiredDate,
      userId: req.user ? req.user._id : null,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// POST /api/mrp/calculate — Calculate MRP netting & shortage status (Section 4.1 Specification)
exports.calculateMRP = async (req, res) => {
  try {
    const productId = req.body.productId;
    const qty = req.body.qty || req.body.targetQty || 100;
    const warehouseId = req.body.warehouseId;

    if (!productId || !warehouseId) {
      return res.status(400).json({ success: false, error: 'productId and warehouseId are required' });
    }

    const result = await MRPEngineService.runMRP({
      productId,
      warehouseId,
      targetQty: qty,
      requiredDate: req.body.requiredDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      userId: req.user ? req.user._id : null,
    });

    const hasShortage = result.summary?.hasShortage || result.requirements.some(r => r.shortageQty > 0);
    const materials = result.requirements.map(r => ({
      materialId: r.materialId,
      materialCode: r.materialCode,
      materialName: r.materialName,
      requiredQty: r.requiredQty,
      availableQty: r.availableQty,
      shortageQty: r.shortageQty,
      action: r.action,
    }));

    res.status(200).json({
      success: true,
      hasShortage,
      canCreateProduction: !hasShortage,
      productId,
      qty,
      warehouseId,
      materials,
      mrpRun: result.mrpRun,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// GET /api/mrp/runs — List recent MRP runs
exports.getMRPRuns = async (req, res) => {
  try {
    const runs = await MRPRun.find()
      .populate('productId', 'name code unit')
      .populate('bomId')
      .populate('warehouseId', 'name code')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: runs.length, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/mrp/runs/:id — Get details of a specific MRP run and its requirements
exports.getMRPRunById = async (req, res) => {
  try {
    const mrpRun = await MRPRun.findById(req.params.id)
      .populate('productId')
      .populate('bomId')
      .populate('warehouseId');

    if (!mrpRun) return res.status(404).json({ success: false, error: 'MRP Run not found' });

    const requirements = await PlanningRequirement.find({ mrpRunId: mrpRun._id });

    res.json({ success: true, mrpRun, requirements });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/mrp/requirements/:id/convert — Convert a requirement into a Production Plan or Purchase Request
exports.convertRequirement = async (req, res) => {
  try {
    const reqDoc = await PlanningRequirement.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ success: false, error: 'Planning requirement not found' });

    const mrpRun = await MRPRun.findById(reqDoc.mrpRunId);
    if (!mrpRun) return res.status(404).json({ success: false, error: 'Associated MRP Run not found' });

    const { targetAction } = req.body; // 'ProductionPlan' or 'PurchaseRequest'

    if (targetAction === 'ProductionPlan' || reqDoc.action === 'Produce') {
      const planCount = await ProductionPlan.countDocuments();
      const planNumber = `PLAN-${Date.now()}-${planCount + 1}`;

      const plan = await ProductionPlan.create({
        planNumber,
        productId: reqDoc.materialId,
        bomId: mrpRun.bomId,
        warehouseId: mrpRun.warehouseId,
        quantity: reqDoc.shortageQty || reqDoc.requiredQty,
        requiredDate: mrpRun.requiredDate,
        status: 'Unscheduled',
        createdBy: req.user ? req.user._id : mrpRun.executedBy,
      });

      reqDoc.status = 'Converted To Plan';
      await reqDoc.save();

      return res.status(201).json({ success: true, convertedType: 'ProductionPlan', plan, requirement: reqDoc });
    } else {
      // Convert to Purchase Request
      const prCount = await PurchaseRequest.countDocuments();
      const requestNumber = `PR-${Date.now()}-${prCount + 1}`;

      const purchaseReq = await PurchaseRequest.create({
        requestNumber,
        materialId: reqDoc.materialId,
        quantity: reqDoc.shortageQty || reqDoc.requiredQty,
        requiredDate: mrpRun.requiredDate,
        warehouseId: mrpRun.warehouseId,
        status: 'Pending',
        requestedBy: req.user ? req.user._id : mrpRun.executedBy,
        notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
      });

      reqDoc.status = 'Converted To PO';
      await reqDoc.save();

      return res.status(201).json({ success: true, convertedType: 'PurchaseRequest', purchaseReq, requirement: reqDoc });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// POST /api/mrp/runs/:id/bulk-convert — Convert all pending shortages in an MRP run at once
exports.bulkConvertRunRequirements = async (req, res) => {
  try {
    const mrpRun = await MRPRun.findById(req.params.id);
    if (!mrpRun) return res.status(404).json({ success: false, error: 'MRP Run not found' });

    const requirements = await PlanningRequirement.find({ mrpRunId: mrpRun._id, status: 'Pending', shortageQty: { $gt: 0 } });
    if (requirements.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending shortages found for conversion in this run' });
    }

    const convertedPRs = [];
    const convertedPlans = [];

    for (const reqDoc of requirements) {
      if (reqDoc.action === 'Produce') {
        const planCount = await ProductionPlan.countDocuments();
        const planNumber = `PLAN-${Date.now()}-${planCount + 1}`;
        const plan = await ProductionPlan.create({
          planNumber,
          productId: reqDoc.materialId,
          bomId: mrpRun.bomId,
          warehouseId: mrpRun.warehouseId,
          quantity: reqDoc.shortageQty || reqDoc.requiredQty,
          requiredDate: mrpRun.requiredDate,
          status: 'Unscheduled',
          createdBy: req.user ? req.user._id : mrpRun.executedBy,
        });
        reqDoc.status = 'Converted To Plan';
        await reqDoc.save();
        convertedPlans.push(plan);
      } else {
        const prCount = await PurchaseRequest.countDocuments();
        const requestNumber = `PR-${Date.now()}-${prCount + 1}`;
        const purchaseReq = await PurchaseRequest.create({
          requestNumber,
          materialId: reqDoc.materialId,
          quantity: reqDoc.shortageQty || reqDoc.requiredQty,
          requiredDate: mrpRun.requiredDate,
          warehouseId: mrpRun.warehouseId,
          status: 'Pending',
          requestedBy: req.user ? req.user._id : mrpRun.executedBy,
          notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
        });
        reqDoc.status = 'Converted To PO';
        await reqDoc.save();
        convertedPRs.push(purchaseReq);
      }
    }

    mrpRun.status = 'Converted';
    await mrpRun.save();

    res.json({
      success: true,
      message: `Successfully converted ${convertedPRs.length} PRs and ${convertedPlans.length} Work Orders.`,
      convertedPRsCount: convertedPRs.length,
      convertedPlansCount: convertedPlans.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
