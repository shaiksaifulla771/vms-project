const mongoose = require('mongoose');
const MRPEngineService = require('../services/mrpEngineService');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const ProductionPlan = require('../models/ProductionPlan');
const PurchaseRequest = require('../models/PurchaseRequest');
const Sequence = require('../models/Sequence');

// Helper: Generate next sequential number for a given counter key
async function nextSeqNumber(key, prefix) {
  let seqDoc = await Sequence.findById(key);
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: key, seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true });
  }
  return `${prefix}-${seqDoc.seq}`;
}

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

// GET /api/mrp — List recent MRP runs (paginated)
exports.getMRPRuns = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      MRPRun.find()
        .populate('productId', 'name code unit')
        .populate('bomId', 'bomNumber version batchSize')
        .populate('warehouseId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      MRPRun.countDocuments(),
    ]);

    res.json({ success: true, count: runs.length, total, page, limit, runs });
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

    const requirements = await PlanningRequirement.find({ mrpRunId: mrpRun._id }).sort({ shortageQty: -1 });

    res.json({ success: true, mrpRun, requirements });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/mrp/requirements/:id/convert — Convert a single requirement into a Production Plan or Purchase Request
exports.convertRequirement = async (req, res) => {
  try {
    const reqDoc = await PlanningRequirement.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ success: false, error: 'Planning requirement not found' });

    if (reqDoc.status !== 'Pending') {
      return res.status(400).json({ success: false, error: `Requirement is already ${reqDoc.status}` });
    }

    const mrpRun = await MRPRun.findById(reqDoc.mrpRunId);
    if (!mrpRun) return res.status(404).json({ success: false, error: 'Associated MRP Run not found' });

    const { targetAction } = req.body; // 'ProductionPlan' or 'PurchaseRequest'
    const shouldProduce = targetAction === 'ProductionPlan' || reqDoc.action === 'Produce';

    if (shouldProduce) {
      const planNumber = await nextSeqNumber('productionPlan', 'PLAN');
      const plan = await ProductionPlan.create({
        planNumber,
        mrpRunId: mrpRun._id,
        productId: reqDoc.materialId,
        bomId: mrpRun.bomId,
        warehouseId: mrpRun.warehouseId,
        quantity: reqDoc.shortageQty || reqDoc.requiredQty,
        originalQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
        remainingQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
        requiredDate: mrpRun.requiredDate,
        status: 'Unscheduled',
        planSource: 'MRP',
        createdBy: req.user ? req.user._id : mrpRun.executedBy,
        notes: `Auto-generated from MRP Run ${mrpRun.runNumber}`,
      });

      reqDoc.status = 'Converted To Plan';
      await reqDoc.save();
      return res.status(201).json({ success: true, convertedType: 'ProductionPlan', plan, requirement: reqDoc });
    } else {
      // Convert to Purchase Request
      const requestNumber = await nextSeqNumber('purchaseRequest', 'PR');
      const purchaseReq = await PurchaseRequest.create({
        requestNumber,
        materialId: reqDoc.materialId,
        quantity: reqDoc.shortageQty || reqDoc.requiredQty,
        requiredDate: mrpRun.requiredDate,
        warehouseId: mrpRun.warehouseId,
        mrpRunId: mrpRun._id,
        status: 'Pending',
        source: 'MRP',
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

// POST /api/mrp/runs/:id/bulk-convert — Convert all pending shortages in an MRP run atomically
exports.bulkConvertRunRequirements = async (req, res) => {
  const session = await mongoose.startSession().catch(() => null);

  try {
    const mrpRun = await MRPRun.findById(req.params.id);
    if (!mrpRun) return res.status(404).json({ success: false, error: 'MRP Run not found' });

    if (mrpRun.status === 'Converted') {
      return res.status(400).json({ success: false, error: 'This MRP Run has already been fully converted' });
    }

    const requirements = await PlanningRequirement.find({
      mrpRunId: mrpRun._id,
      status: 'Pending',
      shortageQty: { $gt: 0 },
    });

    if (requirements.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending shortages found for conversion in this run' });
    }

    const convertedPRs = [];
    const convertedPlans = [];

    const executeConversions = async (activeSession) => {
      const opts = activeSession ? { session: activeSession } : {};

      for (const reqDoc of requirements) {
        if (reqDoc.action === 'Produce') {
          const planNumber = await nextSeqNumber('productionPlan', 'PLAN');
          const [plan] = await ProductionPlan.create([{
            planNumber,
            mrpRunId: mrpRun._id,
            productId: reqDoc.materialId,
            bomId: mrpRun.bomId,
            warehouseId: mrpRun.warehouseId,
            quantity: reqDoc.shortageQty || reqDoc.requiredQty,
            originalQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
            remainingQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
            requiredDate: mrpRun.requiredDate,
            status: 'Unscheduled',
            planSource: 'MRP',
            createdBy: req.user ? req.user._id : mrpRun.executedBy,
            notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
          }], opts);
          reqDoc.status = 'Converted To Plan';
          convertedPlans.push(plan);
        } else {
          const requestNumber = await nextSeqNumber('purchaseRequest', 'PR');
          const [purchaseReq] = await PurchaseRequest.create([{
            requestNumber,
            materialId: reqDoc.materialId,
            quantity: reqDoc.shortageQty || reqDoc.requiredQty,
            requiredDate: mrpRun.requiredDate,
            warehouseId: mrpRun.warehouseId,
            mrpRunId: mrpRun._id,
            status: 'Pending',
            source: 'MRP',
            requestedBy: req.user ? req.user._id : mrpRun.executedBy,
            notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
          }], opts);
          reqDoc.status = 'Converted To PO';
          convertedPRs.push(purchaseReq);
        }
        await reqDoc.save(opts);
      }

      mrpRun.status = 'Converted';
      await mrpRun.save(opts);
    };

    if (session) {
      try {
        await session.withTransaction(async () => {
          await executeConversions(session);
        });
      } catch (txErr) {
        // Fallback if replica set unavailable
        if (txErr.message && txErr.message.includes('Transaction numbers are only allowed')) {
          convertedPRs.length = 0;
          convertedPlans.length = 0;
          await executeConversions(null);
        } else {
          throw txErr;
        }
      } finally {
        session.endSession();
      }
    } else {
      await executeConversions(null);
    }

    res.json({
      success: true,
      message: `Successfully converted ${convertedPRs.length} Purchase Requests and ${convertedPlans.length} Work Orders.`,
      convertedPRsCount: convertedPRs.length,
      convertedPlansCount: convertedPlans.length,
    });
  } catch (err) {
    if (session) session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
};
