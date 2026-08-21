const { eventBus, EVENTS } = require('../eventBus');
const logger = require('../../utils/logger');

/**
 * Planning Event Handlers — Real side-effects for manufacturing lifecycle events.
 * These fire AFTER the primary database write has already committed.
 */
function registerPlanningEventHandlers() {
  logger.info('PlanningHandlers', 'Registering Planning Event Bus Handlers...');

  /**
   * PO_RECEIVED: When a purchase order is received, update linked PurchaseRequirements
   * and recheck material availability for plans with shortages.
   */
  eventBus.on(EVENTS.PO_RECEIVED, async (payload) => {
    logger.info('PlanningHandler', `Handling PO_RECEIVED for PO: ${payload.poId || payload.referenceId}`, { payload });
    try {
      const PurchaseRequirement = require('../../models/PurchaseRequirement');
      const materialIds = payload.materialIds || (payload.materialId ? [payload.materialId] : []);

      if (materialIds.length > 0) {
        const updateResult = await PurchaseRequirement.updateMany(
          { materialId: { $in: materialIds }, status: 'OPEN' },
          { $set: { status: 'FULFILLED', fulfilledAt: new Date(), fulfilledByPO: payload.poId } }
        );
        if (updateResult.modifiedCount > 0) {
          logger.info('PlanningHandler', `Updated ${updateResult.modifiedCount} PurchaseRequirements to FULFILLED`);
        }
      }

      await recheckPlansWithShortages(materialIds);
    } catch (err) {
      logger.error('PlanningHandler', 'Error handling PO_RECEIVED', err);
    }
  });

  /**
   * INVENTORY_RECEIVED / INVENTORY_ADJUSTED / STOCK_TRANSFER_COMPLETED:
   * Recheck material availability for plans with shortages.
   */
  const inventoryChangeHandler = async (eventName, payload) => {
    logger.info('PlanningHandler', `Handling ${eventName} for Material: ${payload.materialId}`, { payload });
    try {
      const materialIds = payload.materialId ? [payload.materialId] : [];
      await recheckPlansWithShortages(materialIds);
    } catch (err) {
      logger.error('PlanningHandler', `Error handling ${eventName}`, err);
    }
  };

  eventBus.on(EVENTS.INVENTORY_RECEIVED, (p) => inventoryChangeHandler('INVENTORY_RECEIVED', p));
  eventBus.on(EVENTS.INVENTORY_ADJUSTED, (p) => inventoryChangeHandler('INVENTORY_ADJUSTED', p));
  eventBus.on(EVENTS.STOCK_TRANSFER_COMPLETED, (p) => inventoryChangeHandler('STOCK_TRANSFER_COMPLETED', p));

  /**
   * PRODUCTION_COMPLETED: Update ProductionPlan completion counters and auto-transition status.
   */
  eventBus.on(EVENTS.PRODUCTION_COMPLETED, async (payload) => {
    logger.info('PlanningHandler', `Handling PRODUCTION_COMPLETED for Order: ${payload.orderId}`, { payload });
    try {
      if (!payload.planId) return;

      const ProductionPlan = require('../../models/ProductionPlan');
      const plan = await ProductionPlan.findById(payload.planId);
      if (!plan) return;

      const completedQty = payload.completedQuantity || payload.quantity || 1;
      plan.completedPlans = (plan.completedPlans || 0) + completedQty;
      plan.remainingQuantity = Math.max(0, (plan.totalPlans || plan.quantity || 0) - plan.completedPlans);

      if (plan.completedPlans >= (plan.totalPlans || plan.quantity || 0)) {
        plan.status = 'COMPLETED';
        plan.completedAt = new Date();
        logger.info('PlanningHandler', `Plan ${plan.planNumber} auto-completed (all units produced)`);
      } else if (plan.completedPlans > 0 && plan.status !== 'COMPLETED') {
        plan.status = 'PARTIALLY_COMPLETED';
      }

      plan.auditHistory = plan.auditHistory || [];
      plan.auditHistory.push({
        action: 'PRODUCTION_COMPLETED_EVENT',
        timestamp: new Date(),
        details: `Production order ${payload.orderId} completed ${completedQty} units. Total: ${plan.completedPlans}/${plan.totalPlans || plan.quantity}`,
      });

      await plan.save();
      logger.info('PlanningHandler', `Plan ${plan.planNumber} updated: ${plan.completedPlans}/${plan.totalPlans || plan.quantity} completed`);
    } catch (err) {
      logger.error('PlanningHandler', 'Error handling PRODUCTION_COMPLETED', err);
    }
  });

  /**
   * MRP_RUN_COMPLETED: Audit trail logging.
   */
  eventBus.on(EVENTS.MRP_RUN_COMPLETED, async (payload) => {
    logger.info('PlanningHandler', `MRP Run completed: ${payload.runNumber}, Shortages: ${payload.totalShortages || 0}`);
  });

  logger.info('PlanningHandlers', 'Planning Event Handlers registered successfully.');
}

/**
 * Recheck material availability for plans with SHORTAGE/PARTIAL status.
 * Called after any inventory change event.
 */
async function recheckPlansWithShortages(changedMaterialIds = []) {
  try {
    const ProductionPlan = require('../../models/ProductionPlan');
    const MRPEngineService = require('../../services/mrpEngineService');

    const plansToRecheck = await ProductionPlan.find({
      'materialStatus.status': { $in: ['SHORTAGE', 'Shortage', 'PARTIAL', 'Partial'] },
      status: { $nin: ['COMPLETED', 'Completed', 'CANCELLED', 'Cancelled'] },
    })
      .select('_id planNumber bomId warehouseId siteId quantity totalPlans materialStatus')
      .limit(50)
      .lean();

    if (plansToRecheck.length === 0) return;

    logger.info('PlanningHandler', `Rechecking material status for ${plansToRecheck.length} plans...`);

    let updatedCount = 0;
    for (const plan of plansToRecheck) {
      if (!plan.bomId) continue;

      const qty = plan.totalPlans || plan.quantity || 1;
      const newStatus = await MRPEngineService.checkMaterialAvailability(
        plan.bomId, qty, plan.warehouseId, plan.siteId
      );

      const oldStatus = plan.materialStatus?.status || 'Not Evaluated';
      if (newStatus.status !== oldStatus) {
        await ProductionPlan.findByIdAndUpdate(plan._id, {
          $set: { materialStatus: newStatus },
          $push: {
            auditHistory: {
              action: 'MATERIAL_RECHECK',
              timestamp: new Date(),
              details: `Material status: ${oldStatus} -> ${newStatus.status} (auto-recheck)`,
            }
          }
        });
        updatedCount++;
        logger.info('PlanningHandler', `Plan ${plan.planNumber}: ${oldStatus} -> ${newStatus.status}`);
      }
    }

    if (updatedCount > 0) {
      logger.info('PlanningHandler', `Rechecked and updated ${updatedCount} plan material statuses`);
    }
  } catch (err) {
    logger.error('PlanningHandler', 'Error in recheckPlansWithShortages', err);
  }
}

module.exports = { registerPlanningEventHandlers };
