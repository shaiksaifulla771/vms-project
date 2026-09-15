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
    const recipient = payload.visitorEmail || payload.email;
    if (recipient) {
      const eventId = `EVT-APT-APP-${payload.appointmentId || payload.appointmentNumber}-${Date.now()}`;
      try {
        await emailService.queueEmail({
          recipient,
          subject: `VendorOS VMS — Appointment Confirmed (${payload.appointmentNumber || ''})`,
          textBody: `Hello ${payload.visitorName || 'Visitor'},\n\nYour appointment has been confirmed.\nHost: ${payload.employeeName || 'Host'}\nDate: ${payload.appointmentDate}\nTime: ${payload.appointmentTime}\n\nRegards,\nVendorOS Administration`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
              <h2 style="color:#16a34a;margin-top:0">Appointment Confirmed</h2>
              <p>Hello <strong>${payload.visitorName || 'Visitor'}</strong>,</p>
              <p>Your appointment has been approved and scheduled:</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
                <p style="margin:0 0 8px 0"><strong>Appointment Number:</strong> ${payload.appointmentNumber || 'N/A'}</p>
                <p style="margin:0 0 8px 0"><strong>Host:</strong> ${payload.employeeName || 'Host'}</p>
                <p style="margin:0 0 8px 0"><strong>Date:</strong> ${payload.appointmentDate}</p>
                <p style="margin:0"><strong>Time:</strong> ${payload.appointmentTime}</p>
              </div>
              <p>Please present this confirmation or your digital pass upon arrival at the facility.</p>
              <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">VendorOS Enterprise VMS</p>
            </div>
          `,
          templateCode: 'APPOINTMENT_APPROVED',
          eventId,
          eventType: 'APPOINTMENT_SCHEDULED'
        });
      } catch (err) {
        logger.error('VMSEventHandlers', `Failed to queue APPOINTMENT_APPROVED email: ${err.message}`);
      }
    }
  });

  eventBus.on(EVENTS.APPOINTMENT_REJECTED, async (payload) => {
    logger.info('VMSEventHandlers', `Handling APPOINTMENT_REJECTED event for appointment: ${payload.appointmentId || payload.id}`);
    const emailService = require('../../services/emailService');
    const recipient = payload.visitorEmail || payload.email;
    if (recipient) {
      const eventId = `EVT-APT-REJ-${payload.appointmentId || payload.appointmentNumber}-${Date.now()}`;
      try {
        await emailService.queueEmail({
          recipient,
          subject: `VendorOS VMS — Appointment Update (${payload.appointmentNumber || ''})`,
          textBody: `Hello ${payload.visitorName || 'Visitor'},\n\nYour appointment request could not be approved at this time.\nReason: ${payload.rejectionReason || 'Facility capacity or scheduling conflict'}\n\nRegards,\nVendorOS Administration`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
              <h2 style="color:#dc2626;margin-top:0">Appointment Update</h2>
              <p>Hello <strong>${payload.visitorName || 'Visitor'}</strong>,</p>
              <p>Your appointment request was not approved at this time.</p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
                <p style="margin:0"><strong>Reason:</strong> ${payload.rejectionReason || 'Facility capacity or scheduling conflict'}</p>
              </div>
              <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">VendorOS Enterprise VMS</p>
            </div>
          `,
          templateCode: 'APPOINTMENT_REJECTED',
          eventId,
          eventType: 'APPOINTMENT_REJECTED'
        });
      } catch (err) {
        logger.error('VMSEventHandlers', `Failed to queue APPOINTMENT_REJECTED email: ${err.message}`);
      }
    }
  });

  eventBus.on(EVENTS.APPOINTMENT_RESCHEDULED, async (payload) => {
    logger.info('VMSEventHandlers', `Handling APPOINTMENT_RESCHEDULED event for appointment: ${payload.appointmentId || payload.id}`);
    const emailService = require('../../services/emailService');
    const recipient = payload.visitorEmail || payload.email;
    if (recipient) {
      const eventId = `EVT-APT-RESCHED-${payload.appointmentId || payload.appointmentNumber}-${Date.now()}`;
      try {
        await emailService.queueEmail({
          recipient,
          subject: `VendorOS VMS — Appointment Rescheduled (${payload.appointmentNumber || ''})`,
          textBody: `Hello ${payload.visitorName || 'Visitor'},\n\nYour appointment has been rescheduled.\nNew Date: ${payload.appointmentDate}\nNew Time: ${payload.appointmentTime}\nHost: ${payload.employeeName || 'Host'}\n\nRegards,\nVendorOS Administration`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
              <h2 style="color:#2563eb;margin-top:0">Appointment Rescheduled</h2>
              <p>Hello <strong>${payload.visitorName || 'Visitor'}</strong>,</p>
              <p>Your appointment has been updated to a new scheduled time:</p>
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0">
                <p style="margin:0 0 8px 0"><strong>Appointment Number:</strong> ${payload.appointmentNumber || 'N/A'}</p>
                <p style="margin:0 0 8px 0"><strong>Host:</strong> ${payload.employeeName || 'Host'}</p>
                <p style="margin:0 0 8px 0"><strong>New Date:</strong> ${payload.appointmentDate}</p>
                <p style="margin:0"><strong>New Time:</strong> ${payload.appointmentTime}</p>
              </div>
              <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">VendorOS Enterprise VMS</p>
            </div>
          `,
          templateCode: 'APPOINTMENT_RESCHEDULED',
          eventId,
          eventType: 'APPOINTMENT_RESCHEDULED'
        });
      } catch (err) {
        logger.error('VMSEventHandlers', `Failed to queue APPOINTMENT_RESCHEDULED email: ${err.message}`);
      }
    }
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
