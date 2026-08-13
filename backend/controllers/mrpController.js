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
        title: `MRP Auto-Requisition: ${reqDoc.materialName}`,
        amount: Math.round((reqDoc.shortageQty || reqDoc.requiredQty || 1) * 100),
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
// POST /api/mrp/runs/:id/bulk-convert — Bulk convert all shortages in an MRP run
exports.bulkConvertRunShortages = async (req, res) => {
  try {
    const result = await MRPEngineService.bulkConvertShortages(req.params.id, req.user ? req.user._id : null);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
