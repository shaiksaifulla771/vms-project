const mongoose = require('mongoose');
const MRPEngineService = require('../services/mrpEngineService');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const PurchaseRequirement = require('../models/PurchaseRequirement');
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
    const { productId, bomId, bomVersion, siteId, warehouseId, warehouseScope, targetQty, requiredDate, horizonDays, demandIds } = req.body;

    const result = await MRPEngineService.runMRP({
      productId,
      bomId,
      bomVersion,
      siteId,
      warehouseId,
      warehouseScope,
      targetQty,
      requiredDate,
      horizonDays,
      demandIds,
      userId: req.user ? req.user._id : null,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// GET /api/mrp or GET /api/mrp/history — List recent MRP runs (paginated)
exports.getMRPRuns = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.siteId && req.query.siteId !== 'ALL' && req.query.siteId !== '') {
      const Warehouse = require('../models/Warehouse');
      const siteWhs = await Warehouse.find({ siteId: req.query.siteId }).select('_id');
      const whIds = siteWhs.map(w => w._id);
      filter.$or = [
        { siteId: req.query.siteId },
        { warehouseId: { $in: whIds } }
      ];
    }
    if (req.query.warehouseId && req.query.warehouseId !== 'ALL' && req.query.warehouseId !== 'all' && req.query.warehouseId !== '') {
      filter.warehouseId = req.query.warehouseId;
    }

    const [runs, total] = await Promise.all([
      MRPRun.find(filter)
        .populate('productId', 'name code unit type')
        .populate('bomId', 'bomNumber version batchSize')
        .populate('warehouseId', 'name code')
        .populate('siteId', 'name code')
        .populate('executedBy', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      MRPRun.countDocuments(filter),
    ]);

    res.json({ success: true, count: runs.length, total, page, limit, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getMRPHistory = exports.getMRPRuns;

// GET /api/mrp/result/:runId or GET /api/mrp/runs/:id — Get details of a specific MRP run
exports.getMRPRunById = async (req, res) => {
  try {
    const id = req.params.runId || req.params.id;
    let mrpRun = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      mrpRun = await MRPRun.findById(id)
        .populate('productId')
        .populate('bomId')
        .populate('warehouseId')
        .populate('siteId', 'name code type')
        .populate('executedBy', 'username email');
    }
    if (!mrpRun) {
      mrpRun = await MRPRun.findOne({ runNumber: id })
        .populate('productId')
        .populate('bomId')
        .populate('warehouseId')
        .populate('siteId', 'name code type')
        .populate('executedBy', 'username email');
    }

    if (!mrpRun) return res.status(404).json({ success: false, error: 'MRP Run not found' });

    const [requirements, productionPlans, purchaseRequirements] = await Promise.all([
      PlanningRequirement.find({ mrpRunId: mrpRun._id }).sort({ shortageQty: -1 }),
      ProductionPlan.find({ mrpRunId: mrpRun._id }).populate('productId bomId warehouseId'),
      PurchaseRequirement.find({ mrpRunId: mrpRun._id }).populate('materialId warehouseId suggestedVendor'),
    ]);

    res.json({
      success: true,
      mrpRun,
      requirements,
      productionPlans,
      purchaseRequirements,
      summary: mrpRun.summary,
      exceptions: mrpRun.exceptions || [],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getMRPResult = exports.getMRPRunById;

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

    const { targetAction } = req.body;
    const shouldProduce = targetAction === 'ProductionPlan' || reqDoc.action === 'Produce';

    if (shouldProduce) {
      const planNumber = await nextSeqNumber('productionPlan', 'PLAN');
      const plan = await ProductionPlan.create({
        planNumber,
        mrpRunId: mrpRun._id,
        productId: reqDoc.materialId,
        product: reqDoc.materialId,
        productCode: reqDoc.materialCode,
        productName: reqDoc.materialName,
        bomId: mrpRun.bomId,
        bom: mrpRun.bomId,
        warehouseId: mrpRun.warehouseId,
        quantity: reqDoc.shortageQty || reqDoc.requiredQty,
        originalQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
        remainingQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
        requiredDate: mrpRun.requiredDate,
        requiredByDate: mrpRun.requiredDate,
        status: 'UNSCHEDULED',
        planSource: 'MRP',
        source: 'MRP',
        sourceReference: mrpRun._id,
        sourceRefModel: 'MRPRun',
        priority: 'MEDIUM',
        createdBy: req.user ? req.user._id : mrpRun.executedBy,
        notes: `Generated from MRP Run ${mrpRun.runNumber} for requirement ${reqDoc.materialName}`,
        auditHistory: [
          {
            action: 'CONVERT_REQUIREMENT_TO_PLAN',
            user: req.user ? req.user._id : null,
            timestamp: new Date(),
            details: `Requirement ${reqDoc._id} converted to ProductionPlan ${planNumber}`,
          }
        ]
      });

      reqDoc.status = 'Converted To Plan';
      await reqDoc.save();
      return res.status(201).json({ success: true, convertedType: 'ProductionPlan', plan, requirement: reqDoc });
    } else {
      const reqNum = await nextSeqNumber('purchaseRequirement', 'PR-REQ');
      const purchaseReq = await PurchaseRequirement.create({
        requirementNumber: reqNum,
        materialId: reqDoc.materialId,
        materialCode: reqDoc.materialCode,
        materialName: reqDoc.materialName,
        quantity: reqDoc.shortageQty || reqDoc.requiredQty,
        unit: reqDoc.unit,
        requiredDate: mrpRun.requiredDate,
        warehouseId: mrpRun.warehouseId,
        siteId: mrpRun.siteId,
        mrpRunId: mrpRun._id,
        status: 'OPEN',
        notes: `Converted from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
        createdBy: req.user ? req.user._id : mrpRun.executedBy,
      });

      reqDoc.status = 'Converted To PO';
      await reqDoc.save();
      return res.status(201).json({ success: true, convertedType: 'PurchaseRequirement', purchaseReq, requirement: reqDoc });
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
            product: reqDoc.materialId,
            productCode: reqDoc.materialCode,
            productName: reqDoc.materialName,
            bomId: mrpRun.bomId,
            bom: mrpRun.bomId,
            warehouseId: mrpRun.warehouseId,
            quantity: reqDoc.shortageQty || reqDoc.requiredQty,
            originalQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
            remainingQuantity: reqDoc.shortageQty || reqDoc.requiredQty,
            requiredDate: mrpRun.requiredDate,
            requiredByDate: mrpRun.requiredDate,
            status: 'UNSCHEDULED',
            planSource: 'MRP',
            source: 'MRP',
            sourceReference: mrpRun._id,
            sourceRefModel: 'MRPRun',
            priority: 'MEDIUM',
            createdBy: req.user ? req.user._id : mrpRun.executedBy,
            notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
          }], opts);
          reqDoc.status = 'Converted To Plan';
          convertedPlans.push(plan);
        } else {
          const reqNum = await nextSeqNumber('purchaseRequirement', 'PR-REQ');
          const [purchaseReq] = await PurchaseRequirement.create([{
            requirementNumber: reqNum,
            materialId: reqDoc.materialId,
            materialCode: reqDoc.materialCode,
            materialName: reqDoc.materialName,
            quantity: reqDoc.shortageQty || reqDoc.requiredQty,
            unit: reqDoc.unit,
            requiredDate: mrpRun.requiredDate,
            warehouseId: mrpRun.warehouseId,
            siteId: mrpRun.siteId,
            mrpRunId: mrpRun._id,
            status: 'OPEN',
            notes: `Auto-generated from MRP Run ${mrpRun.runNumber} for ${reqDoc.materialName}`,
            createdBy: req.user ? req.user._id : mrpRun.executedBy,
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
      message: `Successfully converted ${convertedPRs.length} Purchase Requirements and ${convertedPlans.length} Production Plans.`,
      convertedPRsCount: convertedPRs.length,
      convertedPlansCount: convertedPlans.length,
    });
  } catch (err) {
    if (session) session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
};

