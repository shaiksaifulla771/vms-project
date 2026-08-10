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
  INVENTORY_RECEIVED: 'INVENTORY_RECEIVED',
  INVENTORY_CONSUMED: 'INVENTORY_CONSUMED',
  PO_CREATED: 'PO_CREATED',
  PO_APPROVED: 'PO_APPROVED',
  PO_RECEIVED: 'PO_RECEIVED',
  PRODUCTION_COMPLETED: 'PRODUCTION_COMPLETED',
  QC_PASSED: 'QC_PASSED',
  QC_FAILED: 'QC_FAILED',
  MATERIAL_CREATED: 'MATERIAL_CREATED',
  VENDOR_APPROVED: 'VENDOR_APPROVED',
  APPROVAL_COMPLETED: 'APPROVAL_COMPLETED'
};

module.exports = {
  eventBus,
  EVENTS
};
