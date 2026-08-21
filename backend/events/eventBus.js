const EventEmitter = require('events');
const logger = require('../utils/logger');

/**
 * Domain Event Bus — In-process EventEmitter carrying secondary side-effects only (notifications, audit, planning updates).
 * Primary database writes MUST be executed synchronously by controllers prior to emitting domain events.
 */
class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Safely emit an event. Wraps listener execution to isolate caller from subscriber errors.
   */
  emit(eventName, payload = {}) {
    const eventPayload = {
      timestamp: new Date().toISOString(),
      correlationId: payload.correlationId || null,
      ...payload
    };

    logger.info('EventBus', `Event Emitted: [${eventName}]`, { correlationId: eventPayload.correlationId, payload: eventPayload });

    // Execute listeners safely without crashing caller
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      try {
        const result = listener(eventPayload);
        if (result && typeof result.catch === 'function') {
          result.catch(err => {
            logger.error('EventBus', `Async Listener Error on [${eventName}]`, err);
          });
        }
      } catch (err) {
        logger.error('EventBus', `Sync Listener Error on [${eventName}]`, err);
      }
    }

    return true;
  }
}

const eventBus = new DomainEventBus();

const EVENTS = {
  // Inventory
  INVENTORY_RECEIVED: 'INVENTORY_RECEIVED',
  INVENTORY_CONSUMED: 'INVENTORY_CONSUMED',
  INVENTORY_ADJUSTED: 'INVENTORY_ADJUSTED',
  // Purchasing
  PO_CREATED: 'PO_CREATED',
  PO_APPROVED: 'PO_APPROVED',
  PO_RECEIVED: 'PO_RECEIVED',
  PURCHASE_REQUIREMENT_CONVERTED: 'PURCHASE_REQUIREMENT_CONVERTED',
  // Production
  PRODUCTION_COMPLETED: 'PRODUCTION_COMPLETED',
  PRODUCTION_STARTED: 'PRODUCTION_STARTED',
  // Quality
  QC_PASSED: 'QC_PASSED',
  QC_FAILED: 'QC_FAILED',
  // Masters
  MATERIAL_CREATED: 'MATERIAL_CREATED',
  VENDOR_APPROVED: 'VENDOR_APPROVED',
  // Approvals
  APPROVAL_COMPLETED: 'APPROVAL_COMPLETED',
  // Planning / MRP
  MRP_RUN_COMPLETED: 'MRP_RUN_COMPLETED',
  PLAN_CREATED: 'PLAN_CREATED',
  PLAN_VALIDATED: 'PLAN_VALIDATED',
  PLAN_RELEASED: 'PLAN_RELEASED',
  PLAN_COMPLETED: 'PLAN_COMPLETED',
  PLAN_ON_HOLD: 'PLAN_ON_HOLD',
  PLAN_CANCELLED: 'PLAN_CANCELLED',
  // Stock Transfers
  STOCK_TRANSFER_CREATED: 'STOCK_TRANSFER_CREATED',
  STOCK_TRANSFER_COMPLETED: 'STOCK_TRANSFER_COMPLETED',
  // VMS
  VISITOR_CREATED: 'visitor.created',
  VISITOR_UPDATED: 'visitor.updated',
  VISITOR_APPROVED: 'visitor.approved',
  VISITOR_REJECTED: 'visitor.rejected',
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_APPROVED: 'appointment.approved',
  APPOINTMENT_REJECTED: 'appointment.rejected',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  VISITOR_CHECKED_IN: 'visitor.checked_in',
  VISITOR_CHECKED_OUT: 'visitor.checked_out',
  // Workflow
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed'
};

module.exports = {
  eventBus,
  EVENTS
};
