const mongoose = require('mongoose');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionPlanInstance = require('../models/ProductionPlanInstance');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const InventoryItem = require('../models/InventoryItem');
const Sequence = require('../models/Sequence');
const MRPEngineService = require('./mrpEngineService');

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

// Canonical State Transition Rules (Rev. 2 Specification Part C1)
const ALLOWED_TRANSITIONS = {
  UNSCHEDULED: ['DRAFT', 'SCHEDULED', 'APPROVED', 'CANCELLED'],
  DRAFT: ['VALIDATED', 'UNSCHEDULED', 'CANCELLED'],
  VALIDATED: ['PENDING_APPROVAL', 'APPROVED', 'DRAFT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED'],
  REJECTED: ['DRAFT', 'CANCELLED'],
  APPROVED: ['RELEASED', 'DRAFT', 'SCHEDULED', 'ON_HOLD', 'CANCELLED'],
  SCHEDULED: ['RELEASED', 'APPROVED', 'DRAFT', 'ON_HOLD', 'UNSCHEDULED', 'CANCELLED'],
  RELEASED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['RELEASED', 'SCHEDULED', 'UNSCHEDULED', 'CANCELLED'],
  IN_PROGRESS: ['PARTIALLY_COMPLETED', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
  PARTIALLY_COMPLETED: ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
};

class ProductionPlanningEngine {
  /**
   * Validate state transition against canonical state machine
   */
  static validateTransition(currentStatus, nextStatus) {
    const from = (currentStatus || '').toUpperCase();
    const to = (nextStatus || '').toUpperCase();

    if (from === to) return { valid: true };

    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      return {
        valid: false,
        error: `Invalid status transition from '${from}' to '${to}'. Allowed next states: [${(allowed || []).join(', ')}]`,
      };
    }
    return { valid: true };
  }

  /**
   * Unified Execution Guard: canExecute(planOrInstance)
   * Single server-side guard checked on every release, material issue, and production start
   */
  static async canExecute(planOrInstance) {
    if (!planOrInstance) {
      return { allowed: false, reason: 'Plan or instance document is required' };
    }

    const status = (planOrInstance.status || '').toUpperCase();
    const executableStates = ['APPROVED', 'SCHEDULED', 'RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'];
    if (!executableStates.includes(status)) {
      return {
        allowed: false,
        reason: `Cannot execute plan in status '${status}'. Must be in [${executableStates.join(', ')}]`,
      };
    }

    // 1. Verify Product Material Active
    const productId = planOrInstance.productId?._id || planOrInstance.productId || planOrInstance.product;
    if (productId && mongoose.connection.readyState !== 0) {
      try {
        const product = await Material.findById(productId);
        if (product && product.isActive === false) {
          return { allowed: false, reason: `Target product (${product?.code || productId}) is inactive` };
        }
      } catch (err) {}
    }

    // 2. Verify Warehouse Active
    const warehouseId = planOrInstance.warehouseId?._id || planOrInstance.warehouseId;
    if (warehouseId && mongoose.connection.readyState !== 0) {
      try {
        const warehouse = await Warehouse.findById(warehouseId);
        if (warehouse && warehouse.status === 'Inactive') {
          return { allowed: false, reason: `Target warehouse (${warehouse.name}) is inactive` };
        }
      } catch (err) {}
    }

    // 3. Verify Material Shortages (Strict Execution Blocker)
    const bomId = planOrInstance.bomId?._id || planOrInstance.bomId;
    const quantity = planOrInstance.quantity || planOrInstance.totalPlans || 1;

    if (bomId && mongoose.connection.readyState !== 0) {
      try {
        const check = await MRPEngineService.checkMaterialAvailability(bomId, quantity, warehouseId);
        if (check && (check.status === 'SHORTAGE' || (check.shortages && check.shortages.length > 0))) {
          const shortageNames = (check.shortages || []).map(s => `${s.materialName || s.materialCode} (short: ${s.shortageQty})`).join(', ');
          return {
            allowed: false,
            reason: `Execution blocked due to unresolved material shortages: ${shortageNames}`,
            shortages: check.shortages,
          };
        }
      } catch (err) {}
    }

    return { allowed: true };
  }

  /**
   * Sync progress on Master Plan dynamically from child execution instances
   */
  static async syncPlanProgressFromInstances(planId) {
    const plan = await ProductionPlan.findById(planId);
    if (!plan) throw new Error('Production plan not found');

    const instances = await ProductionPlanInstance.find({ planId });
    if (!instances || instances.length === 0) return plan;

    let completedQty = 0;
    let inProgressQty = 0;
    let allCompleted = true;

    for (const inst of instances) {
      if (inst.status === 'COMPLETED') {
        completedQty += (inst.completedQuantity || inst.quantity || 0);
      } else {
        allCompleted = false;
        if (inst.status === 'IN_PROGRESS' || inst.status === 'PARTIALLY_COMPLETED') {
          inProgressQty += (inst.quantity || 0);
        }
      }
    }

    plan.completedPlans = completedQty;
    plan.availablePlans = Math.max(0, (plan.totalPlans || 0) - completedQty);

    if (allCompleted && instances.length > 0) {
      plan.status = 'COMPLETED';
    } else if (completedQty > 0 || inProgressQty > 0) {
      plan.status = 'PARTIALLY_COMPLETED';
    }

    await plan.save();
    return plan;
  }

  /**
   * Unified Splitting Engine (Rev. 2 Part B5)
   * Splits a planned quantity into execution batch instances by count or by batch size
   */
  static splitPlanIntoBatches(options) {
    const {
      totalQuantity,
      splitMode = 'COUNT', // 'COUNT' | 'SIZE' | 'CUSTOM'
      splitValue, // instance count OR batch size
      customSplits = [],
      startDate = new Date(),
      intervalDays = 1,
      workCenter = 'Main Assembly Line 1',
      shiftId = 'Standard Shift',
      allowPartial = false,
    } = options;

    const total = Number(totalQuantity);
    if (isNaN(total) || total <= 0) {
      throw new Error('Total quantity must be a positive number');
    }

    let instances = [];

    if (splitMode === 'CUSTOM' && Array.isArray(customSplits) && customSplits.length > 0) {
      instances = customSplits.map((s, idx) => ({
        sequence: idx + 1,
        quantity: Number(s.quantity),
        plannedStartDate: s.plannedStartDate ? new Date(s.plannedStartDate) : new Date(startDate.getTime() + idx * intervalDays * 86400000),
        workCenter: s.workCenter || workCenter,
        shiftId: s.shiftId || shiftId,
        notes: s.notes || `Custom Batch ${String.fromCharCode(65 + idx)}`,
      }));
    } else if (splitMode === 'SIZE') {
      const batchSize = Math.max(0.0001, Number(splitValue));
      if (isNaN(batchSize) || batchSize <= 0) {
        throw new Error('Batch size must be a positive number');
      }

      const count = Math.ceil(total / batchSize);
      let allocated = 0;

      for (let i = 0; i < count; i++) {
        const remaining = total - allocated;
        const currentBatchQty = Math.min(batchSize, Math.round(remaining * 10000) / 10000);
        allocated += currentBatchQty;

        instances.push({
          sequence: i + 1,
          quantity: currentBatchQty,
          plannedStartDate: new Date(startDate.getTime() + i * intervalDays * 86400000),
          workCenter,
          shiftId,
          notes: `Batch ${String.fromCharCode(65 + i)} (${currentBatchQty} units)`,
        });
      }
    } else {
      // Default: split by COUNT
      const count = Math.max(1, parseInt(splitValue || 1, 10));
      const baseQty = Math.floor((total / count) * 10000) / 10000;
      let allocated = 0;

      for (let i = 0; i < count; i++) {
        const isLast = i === count - 1;
        const qty = isLast ? Math.round((total - allocated) * 10000) / 10000 : baseQty;
        allocated += qty;

        instances.push({
          sequence: i + 1,
          quantity: qty,
          plannedStartDate: new Date(startDate.getTime() + i * intervalDays * 86400000),
          workCenter,
          shiftId,
          notes: `Instance ${i + 1}/${count}`,
        });
      }
    }

    // Hard validation check
    const sum = instances.reduce((acc, inst) => acc + inst.quantity, 0);
    const roundedSum = Math.round(sum * 10000) / 10000;
    const roundedTotal = Math.round(total * 10000) / 10000;

    if (!allowPartial && Math.abs(roundedSum - roundedTotal) > 0.001) {
      throw new Error(`Split quantities sum (${roundedSum}) does not equal total planned quantity (${roundedTotal}). Set allowPartial=true if partial planning is intended.`);
    }

    return instances;
  }

  /**
   * Pre-Release Server-side Validation (Rev. 2 Part C2)
   */
  static async validatePlanForRelease(planId, userId = null) {
    const plan = await ProductionPlan.findById(planId)
      .populate('productId')
      .populate('product')
      .populate('bomId')
      .populate('bom')
      .populate('warehouseId');

    if (!plan) throw new Error('Production plan not found');

    const errors = [];
    const warnings = [];

    // 1. Requirement check
    const targetProduct = plan.productId || plan.product;
    const targetWarehouse = plan.warehouseId;
    const targetQuantity = Number(plan.quantity || plan.totalPlans || 0);

    if (!targetProduct) errors.push('Target product material is required');
    if (!targetWarehouse) errors.push('Target warehouse is required');
    if (targetQuantity <= 0) errors.push('Planned quantity must be greater than zero');

    // 2. BOM / Ingredients check
    const activeBomId = plan.bomId?._id || plan.bomId || plan.bom?._id || plan.bom;
    if (activeBomId) {
      const activeBom = await BOM.findById(activeBomId);
      if (!activeBom || activeBom.status === 'Deleted') {
        errors.push('Referenced BOM is deleted or invalid');
      }
    } else if (!plan.ingredients || plan.ingredients.length === 0) {
      errors.push('Plan must have an active BOM or ingredient list');
    }

    // 3. Material availability check
    let matStatus = { status: 'READY', shortages: [] };
    if (activeBomId) {
      matStatus = await MRPEngineService.checkMaterialAvailability(
        activeBomId,
        targetQuantity,
        targetWarehouse?._id || targetWarehouse
      );
      if (matStatus.status === 'SHORTAGE') {
        warnings.push(`Material shortages detected for ${matStatus.shortages.length} component(s) — generate purchase requests or trigger MRP`);
      } else if (matStatus.status === 'PARTIAL') {
        warnings.push('Partial inventory available for some components');
      }
    }

    // 4. Custom materials & substitutions check
    if (plan.customMaterials && plan.customMaterials.length > 0) {
      for (const cm of plan.customMaterials) {
        if (!cm.isApproved) {
          warnings.push(`Custom material ${cm.materialCode || cm.materialId} is pending approval`);
        }
      }
    }

    if (plan.substitutions && plan.substitutions.length > 0) {
      for (const sub of plan.substitutions) {
        if (!sub.isApproved) {
          warnings.push(`Material substitution ${sub.substituteMaterialCode} is pending approval`);
        }
      }
    }

    // 5. Maker-checker segregation rule (Rev. 2 Part D1)
    if (plan.requireDifferentApprover) {
      const creatorStr = (plan.createdBy?._id || plan.createdBy || '').toString();
      const approverStr = (userId?._id || userId || '').toString();
      if (creatorStr && approverStr && creatorStr === approverStr) {
        errors.push('Maker-checker policy violation: Creator cannot approve or validate their own plan');
      }
    }

    const isValid = errors.length === 0;
    const canReleaseDirectly = isValid && matStatus.status === 'READY';

    return {
      valid: isValid,
      errors,
      warnings,
      materialStatus: matStatus,
      canRelease: canReleaseDirectly,
      recommendedActions: matStatus.shortages.length > 0
        ? ['CREATE_PURCHASE_REQUEST', 'TRIGGER_MRP_RUN']
        : ['SUBMIT_FOR_APPROVAL', 'SCHEDULE_PRODUCTION'],
    };
  }

  /**
   * Plan Reuse & Staleness Detector (Rev. 2 Part B7)
   */
  static async checkReuseStaleness(sourcePlanId) {
    const sourcePlan = await ProductionPlan.findById(sourcePlanId).populate('productId bomId');
    if (!sourcePlan) throw new Error('Source plan not found for reuse check');

    const productId = sourcePlan.productId?._id || sourcePlan.productId;
    const currentActiveBom = await BOM.findOne({ productId, status: 'Active' })
      .populate('components.materialId');

    const diffs = [];
    let isStale = false;

    if (!currentActiveBom) {
      diffs.push('No active BOM found currently for this product');
      isStale = true;
    } else if (sourcePlan.bomId) {
      const sourceBomVersion = String(sourcePlan.bomVersion || sourcePlan.bomId?.version || '1');
      const currentBomVersion = String(currentActiveBom.version || '1');

      if (sourceBomVersion !== currentBomVersion) {
        diffs.push(`BOM version updated from v${sourceBomVersion} to v${currentBomVersion}`);
        isStale = true;
      }

      if (String(sourcePlan.bomId?._id || sourcePlan.bomId) !== String(currentActiveBom._id)) {
        diffs.push('Active BOM revision has changed');
        isStale = true;
      }
    }

    return {
      isStale,
      diffs,
      currentActiveBom: currentActiveBom ? {
        _id: currentActiveBom._id,
        bomNumber: currentActiveBom.bomNumber,
        version: currentActiveBom.version,
        componentsCount: currentActiveBom.components?.length || 0,
      } : null,
      message: isStale
        ? `Source plan has stale configurations (${diffs.join('; ')}). Re-validation will apply active recipe.`
        : 'Source plan recipe and BOM configurations are up to date.',
    };
  }

  /**
   * Synchronize Master Plan aggregates from database instance records (Rev. 2 Part B6)
   */
  /**
   * Deterministic 10-Criteria Plan Scoring Model (Section 7 Formula)
   */
  static calculateMatchScore(demandReq = {}, plan = {}) {
    const {
      productId,
      requestedQty = 50,
      bomVersion = '1',
      siteId = '',
      warehouseId = '',
      machineId = '',
      shiftId = '',
    } = demandReq;

    const remaining = plan.remainingQuantity !== undefined ? plan.remainingQuantity : (plan.availablePlans !== undefined ? plan.availablePlans : (plan.totalPlans || plan.quantity || 0));
    const subScores = {};

    // 1. BOM Version Match (15%)
    const planBomVer = String(plan.bomVersion || plan.bomId?.version || '1');
    const targetBomVer = String(bomVersion || '1');
    subScores.bomVersionMatch = planBomVer === targetBomVer ? 100 : 0;

    // 2. Site Match (10%)
    const planSiteId = plan.siteId?._id ? plan.siteId._id.toString() : (plan.siteId ? plan.siteId.toString() : '');
    const targetSiteId = siteId ? siteId.toString() : '';
    subScores.siteMatch = (targetSiteId && planSiteId && targetSiteId === planSiteId) || (!targetSiteId && planSiteId) ? 100 : (targetSiteId ? 0 : 50);

    // 3. Warehouse Match (10%)
    const planWhId = plan.warehouseId?._id ? plan.warehouseId._id.toString() : (plan.warehouseId ? plan.warehouseId.toString() : '');
    const targetWhId = warehouseId ? warehouseId.toString() : '';
    subScores.warehouseMatch = (targetWhId && planWhId && targetWhId === planWhId) ? 100 : (targetWhId ? 0 : 50);

    // 4. Quantity Closeness (15%): min(requested, remaining) / requested * 100
    const qtyCloseness = requestedQty > 0
      ? Math.min(100, Math.max(0, Math.round((Math.min(requestedQty, remaining) / requestedQty) * 10000) / 100))
      : 0;
    subScores.quantityCloseness = qtyCloseness;

    // 5. Machine / Line Match (10%)
    const planMachine = plan.schedule?.machineId || plan.schedule?.machine || plan.workCenter || plan.machineId || '';
    const targetMachine = machineId || '';
    subScores.machineMatch = (targetMachine && planMachine && targetMachine.toString() === planMachine.toString()) ? 100 : (targetMachine ? 0 : 70);

    // 6. Shift Match (5%)
    const planShift = plan.schedule?.shiftId || plan.schedule?.shift || plan.shiftId || '';
    const targetShift = shiftId || '';
    subScores.shiftMatch = (targetShift && planShift && targetShift.toString() === planShift.toString()) ? 100 : (targetShift ? 0 : 70);

    // 7. Material Availability at Plan Site (10%)
    const matStatus = (plan.materialStatus?.status || '').toUpperCase();
    subScores.materialAvailability = matStatus === 'READY' ? 100 : (matStatus === 'PARTIAL' ? 50 : (matStatus === 'SHORTAGE' ? 20 : 60));

    // 8. Historical Execution Result (15%)
    const isCompletedClean = plan.status === 'COMPLETED' || plan.completedPlans > 0;
    subScores.historicalExecution = isCompletedClean ? 100 : (plan.status === 'APPROVED' || plan.status === 'SCHEDULED' ? 95 : 75);

    // 9. Current Plan Status (10%)
    const activeStates = ['SCHEDULED', 'UNSCHEDULED', 'APPROVED', 'VALIDATED', 'DRAFT'];
    subScores.currentPlanStatus = (activeStates.includes(plan.status) && remaining > 0) ? 100 : 0;


    // Weighted Total Score Calculation
    const weightedScore = Math.round(
      (subScores.bomVersionMatch * 0.15) +
      (subScores.siteMatch * 0.10) +
      (subScores.warehouseMatch * 0.10) +
      (subScores.quantityCloseness * 0.15) +
      (subScores.machineMatch * 0.10) +
      (subScores.shiftMatch * 0.05) +
      (subScores.materialAvailability * 0.10) +
      (subScores.historicalExecution * 0.15) +
      (subScores.currentPlanStatus * 0.10)
    );

    return {
      totalScore: Math.min(100, Math.max(0, weightedScore)),
      remainingQuantity: remaining,
      subScores: {
        bomVersion: { score: subScores.bomVersionMatch, weight: '15%', label: 'BOM Version Match' },
        site: { score: subScores.siteMatch, weight: '10%', label: 'Site Context Match' },
        warehouse: { score: subScores.warehouseMatch, weight: '10%', label: 'Warehouse Match' },
        quantityCloseness: { score: subScores.quantityCloseness, weight: '15%', label: 'Quantity Closeness' },
        machine: { score: subScores.machineMatch, weight: '10%', label: 'Machine / Work Center' },
        shift: { score: subScores.shiftMatch, weight: '5%', label: 'Shift Allocation' },
        materialAvailability: { score: subScores.materialAvailability, weight: '10%', label: 'Material Readiness' },
        historicalExecution: { score: subScores.historicalExecution, weight: '15%', label: 'Historical Quality' },
        planStatus: { score: subScores.currentPlanStatus, weight: '10%', label: 'Current Plan Status' },
      },
    };
  }

  /**
   * Deterministic Plan Matching Engine (Section 7 Formula)
   */
  static async matchExistingPlans(demandReq = {}) {
    const {
      productId,
      requestedQty = 50,
      bomVersion = '1',
      siteId = '',
      warehouseId = '',
      limit = 10,
    } = demandReq;

    if (!productId) {
      return { success: false, error: 'Product ID is required for deterministic matching' };
    }

    const prodIdStr = productId.toString();
    const candidates = await ProductionPlan.find({
      $or: [
        { productId: prodIdStr },
        { product: prodIdStr },
      ],
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    })
      .populate('bomId')
      .populate('siteId')
      .populate('warehouseId')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    if (!candidates || candidates.length === 0) {
      return { success: true, count: 0, matches: [] };
    }

    const scoredMatches = candidates.map(plan => {
      const scoreDetails = ProductionPlanningEngine.calculateMatchScore(demandReq, plan);

      return {
        planId: plan._id,
        planNumber: plan.planNumber,
        planName: plan.planName,
        productId: plan.productId,
        productCode: plan.productCode,
        productName: plan.productName,
        bomId: plan.bomId?._id || plan.bomId,
        bomVersion: String(plan.bomVersion || plan.bomId?.version || '1'),
        siteId: plan.siteId?._id || plan.siteId,
        siteName: plan.siteId?.name || '',
        warehouseId: plan.warehouseId?._id || plan.warehouseId,
        warehouseName: plan.warehouseId?.name || '',
        totalPlans: plan.totalPlans || plan.quantity,
        remainingQuantity: scoreDetails.remainingQuantity,
        status: plan.status,
        priority: plan.priority,
        requiredDate: plan.requiredDate,
        totalScore: scoreDetails.totalScore,
        subScores: scoreDetails.subScores,
      };
    });

    // Sort by highest match score first
    scoredMatches.sort((a, b) => b.totalScore - a.totalScore);

    return {
      success: true,
      count: scoredMatches.length,
      matches: scoredMatches.slice(0, limit),
    };
  }
}

module.exports = ProductionPlanningEngine;



