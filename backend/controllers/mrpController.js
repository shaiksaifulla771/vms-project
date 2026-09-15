const mongoose = require('mongoose');
const MRPEngineService = require('../services/mrpEngineService');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const PurchaseRequirement = require('../models/PurchaseRequirement');
const ProductionPlan = require('../models/ProductionPlan');
const PurchaseRequest = require('../models/PurchaseRequest');
const { nextSeqNumber } = require('../services/sequenceService');
const { eventBus, EVENTS } = require('../events/eventBus');

// POST /api/mrp/preview — Dry-run calculate candidate MRP proposal without persistence
exports.previewMRP = async (req, res) => {
  try {
    const { productId, bomId, bomVersion, siteId, warehouseId, warehouseScope, targetQty, requiredDate, horizonDays, demandIds } = req.body;

    const proposal = await MRPEngineService.calculateMRPProposal({
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
    });

    res.json({
      success: true,
      proposal,
      summary: proposal.summary,
      requirements: proposal.requirements,
      exceptions: proposal.exceptions,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// POST /api/mrp/run — Trigger and commit a new MRP calculation run (supports async 202 Accepted mode)
exports.executeMRPRun = async (req, res) => {
  try {
    const { productId, bomId, bomVersion, siteId, warehouseId, warehouseScope, targetQty, requiredDate, horizonDays, demandIds, idempotencyKey } = req.body;
    const isAsync = req.query.async === 'true' || req.body.async === true;

    if (isAsync) {
      const runNumber = await nextSeqNumber('mrpRun', 'MRP');
      const queuedRun = await MRPRun.create({
        runNumber,
        status: 'QUEUED',
        productId,
        targetQuantity: targetQty,
        requiredDate: requiredDate || new Date(),
        horizonDays: horizonDays || 30,
        createdBy: req.user ? req.user._id : null,
      });

      // Execute calculation asynchronously in background
      setImmediate(async () => {
        try {
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
            idempotencyKey: idempotencyKey || req.headers['x-idempotency-key'],
            userId: req.user ? req.user._id : null,
            existingRunId: queuedRun._id,
          });

          if (result && result.mrpRun && !result.isDuplicate) {
            eventBus.emit(EVENTS.MRP_RUN_COMPLETED, {
              runId: result.mrpRun._id,
              runNumber: result.mrpRun.runNumber,
              productId,
              targetQty,
              totalShortages: result.summary?.totalShortages || 0,
              hasShortage: result.summary?.hasShortage || false,
              correlationId: req.correlationId
            });
          }
        } catch (bgErr) {
          console.error('[MRP-Async] Background calculation error:', bgErr.message);
          await MRPRun.findByIdAndUpdate(queuedRun._id, { status: 'FAILED', errorReason: bgErr.message });
        }
      });

      return res.status(202).json({
        success: true,
        status: 'QUEUED',
        runId: queuedRun._id,
        runNumber,
        message: 'MRP calculation accepted and processing asynchronously in background.',
        pollUrl: `/api/mrp/runs/${queuedRun._id}`,
      });
    }

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
      idempotencyKey: idempotencyKey || req.headers['x-idempotency-key'],
      userId: req.user ? req.user._id : null,
    });

    if (result && result.mrpRun && !result.isDuplicate) {
      eventBus.emit(EVENTS.MRP_RUN_COMPLETED, {
        runId: result.mrpRun._id,
        runNumber: result.mrpRun.runNumber,
        productId,
        targetQty,
        totalShortages: result.summary?.totalShortages || 0,
        hasShortage: result.summary?.hasShortage || false,
        correlationId: req.correlationId
      });
    }

    res.status(result.isDuplicate ? 200 : 201).json(result);
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

// GET /api/mrp/summary — Fast aggregate metrics for MRP Dashboard
exports.getMRPPlanningSummary = async (req, res) => {
  try {
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
    if (req.query.productId && req.query.productId !== 'ALL' && req.query.productId !== '') {
      filter.productId = req.query.productId;
    }

    const [plans, totalPurchaseReqs, openMRPRuns] = await Promise.all([
      ProductionPlan.find(filter).select('status priority requiredDate materialStatus quantity totalPlans'),
      PurchaseRequirement.countDocuments({ status: { $ne: 'CANCELLED' } }),
      MRPRun.find(filter).select('exceptions summary createdAt').limit(10).lean()
    ]);

    const summary = {
      totalPlans: plans.length,
      unscheduled: 0,
      scheduled: 0,
      released: 0,
      inProgress: 0,
      completed: 0,
      delayed: 0,
      onHold: 0,
      cancelled: 0,
      materialShortages: 0,
      exceptionsCount: 0,
      purchaseRequirements: totalPurchaseReqs,
    };

    const now = new Date();

    plans.forEach(p => {
      const st = (p.status || '').toUpperCase();
      if (st === 'UNSCHEDULED' || st === 'DRAFT' || st === 'PENDING') summary.unscheduled++;
      else if (st === 'SCHEDULED' || st === 'PARTIALLY SCHEDULED') summary.scheduled++;
      else if (st === 'RELEASED') summary.released++;
      else if (st === 'IN_PROGRESS' || st === 'IN PRODUCTION') summary.inProgress++;
      else if (st === 'COMPLETED') summary.completed++;
      else if (st === 'ON_HOLD') summary.onHold++;
      else if (st === 'CANCELLED') summary.cancelled++;

      // Check if delayed
      if (p.requiredDate && new Date(p.requiredDate) < now && !['COMPLETED', 'CANCELLED'].includes(st)) {
        summary.delayed++;
      }

      // Check material shortage
      if (p.materialStatus && (p.materialStatus.status === 'SHORTAGE' || p.materialStatus.status === 'Shortage' || (p.materialStatus.shortages && p.materialStatus.shortages.length > 0))) {
        summary.materialShortages++;
      }
    });

    openMRPRuns.forEach(r => {
      if (r.exceptions && Array.isArray(r.exceptions)) {
        summary.exceptionsCount += r.exceptions.length;
      }
    });

    res.status(200).json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/mrp/exceptions — Aggregated Planning Exceptions
exports.getPlanningExceptions = async (req, res) => {
  try {
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

    const [mrpRuns, delayedPlans, shortagePlans] = await Promise.all([
      MRPRun.find(filter).select('runNumber exceptions createdAt productId warehouseId')
        .populate('productId', 'name code')
        .populate('warehouseId', 'name code')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      ProductionPlan.find({
        ...filter,
        requiredDate: { $lt: new Date() },
        status: { $nin: ['COMPLETED', 'Completed', 'CANCELLED', 'Cancelled'] }
      }).populate('productId warehouseId').limit(20).lean(),
      ProductionPlan.find({
        ...filter,
        'materialStatus.status': { $in: ['SHORTAGE', 'Shortage', 'PARTIAL', 'Partial'] },
        status: { $nin: ['COMPLETED', 'Completed', 'CANCELLED', 'Cancelled'] }
      }).populate('productId warehouseId').limit(20).lean(),
    ]);

    const exceptions = [];

    mrpRuns.forEach(run => {
      if (run.exceptions && Array.isArray(run.exceptions)) {
        run.exceptions.forEach(ex => {
          exceptions.push({
            id: `MRP-${run.runNumber}-${ex.code}`,
            type: 'MRP_EXCEPTION',
            code: ex.code || 'MATERIAL_SHORTAGE',
            severity: ex.severity || 'WARNING',
            message: ex.message,
            productName: run.productId?.name,
            productCode: run.productId?.code,
            warehouseName: run.warehouseId?.name,
            sourceRef: run.runNumber,
            date: run.createdAt,
            actionRequired: 'Review MRP netting & generate purchase requirement'
          });
        });
      }
    });

    delayedPlans.forEach(plan => {
      exceptions.push({
        id: `DELAY-${plan.planNumber}`,
        type: 'DELAYED_PLAN',
        code: 'OVERDUE_PRODUCTION',
        severity: 'ERROR',
        message: `Plan ${plan.planNumber} required date (${new Date(plan.requiredDate).toLocaleDateString()}) is past due.`,
        productName: plan.productName || plan.productId?.name,
        productCode: plan.productCode || plan.productId?.code,
        warehouseName: plan.warehouseId?.name,
        sourceRef: plan.planNumber,
        date: plan.requiredDate,
        actionRequired: 'Reschedule or expedite production'
      });
    });

    shortagePlans.forEach(plan => {
      const shortages = plan.materialStatus?.shortages || [];
      const shortageNames = shortages.map(s => s.materialName || s.materialCode).join(', ') || 'Raw Materials';
      exceptions.push({
        id: `SHORTAGE-${plan.planNumber}`,
        type: 'MATERIAL_SHORTAGE',
        code: 'MATERIAL_SHORTAGE',
        severity: 'WARNING',
        message: `Shortage detected for components: ${shortageNames}`,
        productName: plan.productName || plan.productId?.name,
        productCode: plan.productCode || plan.productId?.code,
        warehouseName: plan.warehouseId?.name,
        sourceRef: plan.planNumber,
        date: plan.requiredDate,
        actionRequired: 'Create Purchase Request or Transfer Stock'
      });
    });

    res.status(200).json({ success: true, count: exceptions.length, data: exceptions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/mrp/purchase-requirements/:id/convert-to-po — Convert a Purchase Requirement to an actual Purchase Order
exports.convertPurchaseRequirementToPO = async (req, res) => {
  try {
    const PurchaseOrder = require('../models/PurchaseOrder');
    const Vendor = require('../models/Vendor');
    const Material = require('../models/Material');

    const prDoc = await PurchaseRequirement.findById(req.params.id);
    if (!prDoc) {
      return res.status(404).json({ success: false, error: 'Purchase requirement not found' });
    }

    if (prDoc.status === 'CONVERTED_TO_PO') {
      return res.status(400).json({
        success: false,
        error: 'This requirement has already been converted to a Purchase Order',
        purchaseOrderId: prDoc.convertedPurchaseOrderId
      });
    }

    // Resolve vendor
    let vendorId = req.body.vendorId || prDoc.suggestedVendor;
    if (!vendorId) {
      const mat = await Material.findById(prDoc.materialId);
      if (mat && mat.defaultVendorId) {
        vendorId = mat.defaultVendorId;
      } else {
        const defaultVendor = await Vendor.findOne({ status: 'Active' });
        if (defaultVendor) vendorId = defaultVendor._id;
      }
    }

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        error: 'No active vendor found. Please specify vendorId in request body.'
      });
    }

    // Calculate price
    const unitPrice = Number(req.body.unitPrice || prDoc.estimatedUnitPrice || 10);
    const quantity = Number(prDoc.quantity);
    const totalAmount = quantity * unitPrice;

    const poNumber = await nextSeqNumber('purchaseOrder', 'PO');

    const po = await PurchaseOrder.create({
      poNumber,
      vendorId,
      materials: [
        {
          materialId: prDoc.materialId,
          quantity,
          unitPrice
        }
      ],
      totalAmount,
      requestedBy: req.user ? req.user._id : (prDoc.createdBy || null),
      status: 'Pending'
    });

    prDoc.status = 'CONVERTED_TO_PO';
    prDoc.convertedPurchaseOrderId = po._id;
    await prDoc.save();

    // Emit domain events
    eventBus.emit(EVENTS.PO_CREATED, {
      poId: po._id,
      poNumber: po.poNumber,
      vendorId,
      materials: po.materials,
      totalAmount,
      requestedBy: req.user ? req.user._id : null,
      sourceRequirementId: prDoc._id,
      correlationId: req.correlationId
    });

    eventBus.emit(EVENTS.PURCHASE_REQUIREMENT_CONVERTED, {
      requirementId: prDoc._id,
      poId: po._id,
      poNumber: po.poNumber,
      materialId: prDoc.materialId,
      correlationId: req.correlationId
    });

    const populatedPO = await PurchaseOrder.findById(po._id)
      .populate('vendorId', 'name company email')
      .populate('materials.materialId', 'name code unit')
      .populate('requestedBy', 'username email');

    res.status(201).json({
      success: true,
      message: `Purchase Requirement ${prDoc.requirementNumber} converted to Purchase Order ${poNumber}`,
      purchaseOrder: populatedPO,
      requirement: prDoc
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


