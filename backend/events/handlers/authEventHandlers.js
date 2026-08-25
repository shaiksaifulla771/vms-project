const { eventBus, EVENTS } = require('../eventBus');
const emailService = require('../../services/emailService');
const logger = require('../../utils/logger');

/**
 * Domain Event Handlers for User Authentication, Approval, and Lifecycle Events
 */
function registerAuthEventHandlers() {
  logger.info('AuthEventHandlers', 'Registering Auth Domain Event Handlers...');

  // 1. Account Approved Handler
  eventBus.on(EVENTS.ACCOUNT_APPROVED, async (payload) => {
    logger.info('AuthEventHandlers', `Handling ACCOUNT_APPROVED for [${payload.email}]`);
    const { email, username, role, siteNames, warehouseNames, approvedByName, userId } = payload;

    if (!email) return;

    const eventId = `EVT-APPROVE-${userId || email}-${Date.now()}`;
    const sitesStr = siteNames && siteNames.length > 0 ? siteNames.join(', ') : 'Default Location Scope';
    const warehousesStr = warehouseNames && warehouseNames.length > 0 ? warehouseNames.join(', ') : 'All Assigned Warehouses';

    try {
      await emailService.queueEmail({
        recipient: email,
        subject: 'Welcome to VendorOS VMS — Your Account Has Been Approved',
        textBody: `Hello ${username || 'User'},\n\nYour account has been approved by Administrator ${approvedByName || 'System Administrator'}.\nAssigned Role: ${role || 'Viewer'}\nAssigned Sites: ${sitesStr}\nAssigned Warehouses: ${warehousesStr}\n\nYou may now log in to the VendorOS VMS portal.\n\nRegards,\nVendorOS VMS Administration`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
            <h2 style="color:#16a34a;margin-top:0">Welcome to VendorOS VMS</h2>
            <p>Hello <strong>${username || 'User'}</strong>,</p>
            <p>Your account access request has been approved by Administrator <strong>${approvedByName || 'System Administrator'}</strong>.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px 0"><strong>Assigned Role:</strong> <span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-weight:700">${role || 'Viewer'}</span></p>
              <p style="margin:0 0 8px 0"><strong>Assigned Sites:</strong> ${sitesStr}</p>
              <p style="margin:0"><strong>Assigned Warehouses:</strong> ${warehousesStr}</p>
            </div>
            <p>You can now sign in using your registered credentials.</p>
            <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">VendorOS Enterprise Visitor & Operations Management</p>
          </div>
        `,
        templateCode: 'AUTH_ACCESS_APPROVED',
        eventId,
        eventType: 'ACCOUNT_APPROVED',
        userId,
        metadata: { role, approvedByName, sitesStr, warehousesStr }
      });
      logger.info('AuthEventHandlers', `✓ Welcome approval email queued for [${email}]`);
    } catch (err) {
      logger.error('AuthEventHandlers', `Failed to queue approval email for [${email}]`, err);
    }
  });

  // 2. Account Rejected Handler
  eventBus.on(EVENTS.ACCOUNT_REJECTED, async (payload) => {
    logger.info('AuthEventHandlers', `Handling ACCOUNT_REJECTED for [${payload.email}]`);
    const { email, username, reason, rejectedByName, userId } = payload;

    if (!email) return;

    const eventId = `EVT-REJECT-${userId || email}-${Date.now()}`;
    const reasonStr = reason || 'Role request not aligned with current staffing requirements.';

    try {
      await emailService.queueEmail({
        recipient: email,
        subject: 'Update Regarding Your VendorOS VMS Access Request',
        textBody: `Hello ${username || 'Candidate'},\n\nYour VendorOS VMS access request was not approved at this time.\nReason: ${reasonStr}\n\nRegards,\nVendorOS VMS Administration`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
            <h2 style="color:#dc2626;margin-top:0">Access Request Update</h2>
            <p>Hello <strong>${username || 'Candidate'}</strong>,</p>
            <p>Your VendorOS VMS account access request was reviewed by Administrator <strong>${rejectedByName || 'System Administrator'}</strong> and was not approved at this time.</p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0"><strong>Reason:</strong> ${reasonStr}</p>
            </div>
            <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">If you believe this is an error, please contact your facility administrator.</p>
          </div>
        `,
        templateCode: 'AUTH_ACCESS_REJECTED',
        eventId,
        eventType: 'ACCOUNT_REJECTED',
        userId,
        metadata: { reason: reasonStr, rejectedByName }
      });
      logger.info('AuthEventHandlers', `✓ Rejection notification email queued for [${email}]`);
    } catch (err) {
      logger.error('AuthEventHandlers', `Failed to queue rejection email for [${email}]`, err);
    }
  });

  logger.info('AuthEventHandlers', '✓ Auth Event Handlers registered successfully.');
}

module.exports = { registerAuthEventHandlers };
