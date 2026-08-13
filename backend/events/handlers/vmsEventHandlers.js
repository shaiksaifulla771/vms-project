const { eventBus, EVENTS } = require('../eventBus');
const logger = require('../../utils/logger');

function registerVMSEventHandlers() {
  logger.info('VMSEventHandlers', 'Registering VMS Event Bus Handlers...');

  // Subscribe to Visitor & Appointment events to execute workflow engine & emails
  eventBus.on(EVENTS.VISITOR_CREATED, async (payload) => {
    logger.info('VMSEventHandlers', `Handling VISITOR_CREATED event for visitor: ${payload.visitorId || payload.id}`);
    const emailService = require('../../services/emailService');
    const workflowEngineService = require('../../services/workflowEngineService');
    
    // 1. Send confirmation email directly to the registered visitor's email address
    const recipient = payload.visitorEmail || payload.email;
    if (recipient) {
      try {
        await emailService.sendTemplateEmail('VISITOR_REGISTRATION', recipient, {
          visitorName: payload.visitorName || payload.fullName || 'Valued Visitor',
          visitorEmail: recipient,
          employeeName: payload.hostName || 'Host',
          appointmentDate: payload.appointmentDate || new Date().toISOString().split('T')[0],
          appointmentTime: payload.appointmentTime || 'Scheduled Time',
          status: payload.status || 'REGISTERED',
          companyName: 'VendorOS VMS'
        });
        logger.info('VMSEventHandlers', `✓ Visitor registration confirmation email dispatched to [${recipient}]`);
      } catch (err) {
        logger.error('VMSEventHandlers', `Failed to send visitor registration email to [${recipient}]`, err);
      }
    }

    // 2. Execute any registered workflow engines
    await workflowEngineService.executeWorkflow(EVENTS.VISITOR_CREATED, payload);
  });

  eventBus.on(EVENTS.APPOINTMENT_CREATED, async (payload) => {
    logger.info('VMSEventHandlers', `Handling APPOINTMENT_CREATED event for appointment: ${payload.appointmentId || payload.id}`);
    const workflowEngineService = require('../../services/workflowEngineService');
    await workflowEngineService.executeWorkflow(EVENTS.APPOINTMENT_CREATED, payload);
  });

  eventBus.on(EVENTS.APPOINTMENT_APPROVED, async (payload) => {
    logger.info('VMSEventHandlers', `Handling APPOINTMENT_APPROVED event for appointment: ${payload.appointmentId || payload.id}`);
    const emailService = require('../../services/emailService');
    await emailService.sendTemplateEmail('APPOINTMENT_APPROVED', payload.visitorEmail || payload.email, payload);
  });

  eventBus.on(EVENTS.APPOINTMENT_REJECTED, async (payload) => {
    logger.info('VMSEventHandlers', `Handling APPOINTMENT_REJECTED event for appointment: ${payload.appointmentId || payload.id}`);
    const emailService = require('../../services/emailService');
    await emailService.sendTemplateEmail('APPOINTMENT_REJECTED', payload.visitorEmail || payload.email, payload);
  });

  eventBus.on(EVENTS.VISITOR_CHECKED_IN, async (payload) => {
    logger.info('VMSEventHandlers', `Handling VISITOR_CHECKED_IN event for visitor: ${payload.visitorId || payload.id}`);
    const emailService = require('../../services/emailService');
    if (payload.hostEmail) {
      await emailService.sendTemplateEmail('VISITOR_CHECK_IN', payload.hostEmail, payload);
    }
  });

  eventBus.on(EVENTS.VISITOR_CHECKED_OUT, async (payload) => {
    logger.info('VMSEventHandlers', `Handling VISITOR_CHECKED_OUT event for visitor: ${payload.visitorId || payload.id}`);
    const emailService = require('../../services/emailService');
    if (payload.hostEmail) {
      await emailService.sendTemplateEmail('VISITOR_CHECK_OUT', payload.hostEmail, payload);
    }
  });

  logger.info('VMSEventHandlers', '✓ VMS Event Handlers registered successfully.');
}

module.exports = { registerVMSEventHandlers };
