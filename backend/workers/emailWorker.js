const emailService = require('../services/emailService');
const EmailLog = require('../models/EmailLog');
const logger = require('../utils/logger');

/**
 * BullMQ Worker Processor for asynchronous email dispatch.
 * Handles idempotency checks, retry policies, and tracking status in EmailLog.
 */
module.exports = async function emailProcessor(job) {
  const { recipient, subject, htmlBody, textBody, templateCode, eventId, eventType, metadata, userId } = job.data;

  if (!recipient || !subject) {
    throw new Error('recipient and subject are required email job parameters.');
  }

  logger.info('EmailWorker', `Processing email job ${job.id} for [${recipient}] with eventId: ${eventId || 'none'}`);

  // 1. Idempotency Check: Prevent duplicate sends if eventId was already processed
  if (eventId) {
    const existingLog = await EmailLog.findOne({
      eventId,
      status: { $in: ['Sent', 'DELIVERED'] }
    });

    if (existingLog) {
      logger.info('EmailWorker', `Duplicate email event [${eventId}] detected. Skipping duplicate send.`);
      return {
        status: 'skipped_duplicate',
        messageId: existingLog.messageId,
        eventId
      };
    }
  }

  // 2. Dispatch email via EmailService
  try {
    const emailLog = await emailService.sendEmail({
      recipient,
      subject,
      htmlBody,
      textBody,
      templateCode,
      eventId,
      eventType,
      metadata: {
        ...(metadata || {}),
        bullMqJobId: job.id,
        attemptsMade: job.attemptsMade
      },
      userId
    });

    if (emailLog && emailLog.status === 'Failed') {
      throw new Error(emailLog.error || 'Email dispatch failed in transport provider');
    }

    return {
      status: 'sent',
      messageId: emailLog ? emailLog.messageId : null,
      eventId
    };
  } catch (err) {
    logger.error('EmailWorker', `Failed job ${job.id} for [${recipient}]: ${err.message}`, err);
    throw err; // Let BullMQ retry with backoff
  }
};
