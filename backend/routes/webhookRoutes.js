const express = require('express');
const router = express.Router();
const EmailLog = require('../models/EmailLog');
const logger = require('../utils/logger');

/**
 * @desc    Brevo Delivery Webhook Receiver
 * @route   POST /api/webhooks/brevo
 * @access  Public (Brevo Webhook with optional shared secret verification)
 */
router.post('/brevo', async (req, res) => {
  try {
    const event = req.body;
    
    // Optional secret token verification if configured in environment
    if (process.env.BREVO_WEBHOOK_SECRET) {
      const authHeader = req.headers['x-brevo-webhook-secret'] || req.headers['authorization'];
      if (authHeader !== process.env.BREVO_WEBHOOK_SECRET) {
        logger.warn('BrevoWebhook', `Unauthorized webhook attempt from IP: ${req.ip}`);
        return res.status(401).json({ success: false, error: 'Unauthorized webhook' });
      }
    }

    const { event: eventName, email, message_id, 'message-id': altMessageId, date } = event;
    const resolvedMessageId = message_id || altMessageId;

    logger.info('BrevoWebhook', `Received Brevo event [${eventName}] for [${email}] (MessageId: ${resolvedMessageId})`);

    // Map Brevo event names to our EmailLog statuses
    let newStatus = null;
    if (['delivered', 'delivered_first_time'].includes(eventName)) {
      newStatus = 'DELIVERED';
    } else if (['hard_bounce', 'soft_bounce', 'blocked', 'spam', 'invalid_email'].includes(eventName)) {
      newStatus = 'BOUNCED';
    } else if (['error', 'deferred'].includes(eventName)) {
      newStatus = 'Failed';
    }

    if (newStatus && (resolvedMessageId || email)) {
      const query = resolvedMessageId
        ? { messageId: resolvedMessageId }
        : { recipient: email };

      await EmailLog.findOneAndUpdate(
        query,
        {
          $set: {
            status: newStatus,
            ...(newStatus === 'DELIVERED' ? { deliveredAt: date ? new Date(date) : new Date() } : {}),
            metadata: { brevoEvent: event }
          }
        },
        { sort: { createdAt: -1 } }
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('BrevoWebhook', `Webhook processing error: ${err.message}`, err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

module.exports = router;
