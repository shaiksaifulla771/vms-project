const { eventBus, EVENTS } = require('../eventBus');
const logger = require('../../utils/logger');

// Secondary handler: update planning status when inventory is received or consumed
eventBus.on(EVENTS.PO_RECEIVED, (payload) => {
  logger.info('PlanningHandler', `Received PO_RECEIVED notification for PO: ${payload.poId || payload.referenceId}`, { payload });
});

eventBus.on(EVENTS.INVENTORY_RECEIVED, (payload) => {
  logger.info('PlanningHandler', `Received INVENTORY_RECEIVED notification for Material: ${payload.materialId}`, { payload });
});

eventBus.on(EVENTS.PRODUCTION_COMPLETED, (payload) => {
  logger.info('PlanningHandler', `Received PRODUCTION_COMPLETED notification for Order: ${payload.orderId}`, { payload });
});

module.exports = {};
