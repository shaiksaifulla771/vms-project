const EmailQueue = require('../models/EmailQueue');
const EmailLog = require('../models/EmailLog');
const EmailTemplate = require('../models/EmailTemplate');
const emailTemplateService = require('./emailTemplateService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

class EmailService {
  getProvider() {
    return process.env.EMAIL_PROVIDER || 'console';
  }

  getSmtpCredentials() {
    return {
      user: process.env.EMAIL_USER || process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD
    };
  }

  isSmtpConfigured() {
    const { user, pass } = this.getSmtpCredentials();
    return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_PORT && user && pass);
  }

  /**
   * Direct email dispatch
   */
  async sendEmail(options) {
    const { recipient, cc, bcc, subject, htmlBody, textBody, templateCode, metadata, userId } = options;
    const provider = this.getProvider();

    logger.info('EmailService', `Dispatching email to [${recipient}] with subject: "${subject}" via [${provider}] provider`);

    let status = 'Sent';
    let errorMsg = null;
    let messageId = `MSG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (provider === 'smtp') {
        if (!nodemailer) {
          throw new Error('SMTP email requires the nodemailer package to be installed');
        }

        if (!this.isSmtpConfigured()) {
          throw new Error('SMTP email is not configured. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER/EMAIL_USERNAME, and EMAIL_PASS/EMAIL_PASSWORD.');
        }

        const { user: emailUser, pass: emailPass } = this.getSmtpCredentials();

        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: Number(process.env.EMAIL_PORT || 587),
          secure: process.env.EMAIL_SECURE === 'true',
          auth: emailUser && emailPass ? {
            user: emailUser,
            pass: emailPass
          } : undefined
        });

        const info = await transporter.sendMail({
          from: process.env.EMAIL_FROM || emailUser || 'no-reply@vendoros.local',
          to: recipient,
          cc,
          bcc,
          subject,
          html: htmlBody,
          text: textBody
        });

        messageId = info.messageId || messageId;
        logger.info('EmailService', `SMTP Email dispatched to ${recipient}`);
      } else {
        // Console / Mock Dev Provider
        logger.info('EmailService', `[DEV MOCK EMAIL DISPATCH] To: ${recipient} | Subject: ${subject} | Body: ${textBody || htmlBody || ''}`);
      }
    } catch (err) {
      status = 'Failed';
      errorMsg = err.message;
      logger.error('EmailService', `Failed to send email to ${recipient}`, err);
    }

    const emailLog = await EmailLog.create({
      recipient,
      subject,
      templateCode: templateCode || 'MANUAL',
      status,
      sentAt: new Date(),
      messageId,
      error: errorMsg,
      metadata: { ...(metadata || {}), provider }
    });

    if (userId) {
      await auditService.writeAuditLog(
        null,
        'EmailQueue',
        emailLog._id,
        'SEND',
        null,
        { recipient, subject, status },
        userId
      );
    }

    return emailLog;
  }

  /**
   * Render template and send email
   */
  async sendTemplateEmail(templateCode, recipient, data = {}, userId = null) {
    const template = await EmailTemplate.findOne({ templateCode, isActive: true });
    if (!template) {
      logger.warn('EmailService', `Template [${templateCode}] not found or inactive. Sending fallback email.`);
      return this.sendEmail({
        recipient,
        subject: data.subject || 'VMS Notification',
        htmlBody: `<p>${data.message || 'Notification from VMS'}</p>`,
        templateCode,
        userId
      });
    }

    const mergedData = { companyName: 'VendorOS VMS', ...data };
    const htmlBody = emailTemplateService.compileTemplate(template.htmlBody, mergedData);
    const textBody = emailTemplateService.compileTemplate(template.textBody || '', mergedData);
    const subject = emailTemplateService.compileTemplate(template.subject, mergedData);

    return this.sendEmail({
      recipient,
      subject,
      htmlBody,
      textBody,
      templateCode,
      metadata: mergedData,
      userId
    });
  }

  /**
   * Queue email for asynchronous processing
   */
  async queueEmail(options) {
    const queueItem = await EmailQueue.create({
      recipient: options.recipient,
      cc: options.cc || [],
      bcc: options.bcc || [],
      subject: options.subject,
      htmlBody: options.htmlBody,
      textBody: options.textBody || '',
      templateCode: options.templateCode || null,
      templateData: options.templateData || {},
      status: 'Pending',
      scheduledFor: options.scheduledFor || new Date()
    });

    // Auto-process queue item
    setImmediate(() => this.processQueueItem(queueItem._id));

    return queueItem;
  }

  /**
   * Schedule email for future execution
   */
  async scheduleEmail(options, scheduleTime) {
    return this.queueEmail({
      ...options,
      scheduledFor: new Date(scheduleTime)
    });
  }

  /**
   * Process single queue item
   */
  async processQueueItem(queueId) {
    const queueItem = await EmailQueue.findById(queueId);
    if (!queueItem || queueItem.status === 'Sent') return;

    queueItem.status = 'Sending';
    queueItem.attempts += 1;
    await queueItem.save();

    try {
      await this.sendEmail({
        recipient: queueItem.recipient,
        cc: queueItem.cc,
        bcc: queueItem.bcc,
        subject: queueItem.subject,
        htmlBody: queueItem.htmlBody,
        textBody: queueItem.textBody,
        templateCode: queueItem.templateCode
      });

      queueItem.status = 'Sent';
      queueItem.sentAt = new Date();
      await queueItem.save();
    } catch (err) {
      queueItem.errorLog.push(`Attempt ${queueItem.attempts}: ${err.message}`);
      if (queueItem.attempts >= queueItem.maxAttempts) {
        queueItem.status = 'Failed';
      } else {
        queueItem.status = 'Retrying';
      }
      await queueItem.save();
    }
  }

  /**
   * Retry failed queue email
   */
  async retryEmail(queueId) {
    const queueItem = await EmailQueue.findById(queueId);
    if (!queueItem) throw new Error('Email queue item not found');

    queueItem.status = 'Pending';
    queueItem.attempts = 0;
    await queueItem.save();

    return this.processQueueItem(queueId);
  }

  /**
   * Get queue status
   */
  async getEmailStatus(queueId) {
    return EmailQueue.findById(queueId);
  }

  /**
   * Process email queue in background
   */
  async processEmailQueue() {
    try {
      const now = new Date();
      const items = await EmailQueue.find({
        status: { $in: ['QUEUED', 'RETRYING'] },
        $or: [
          { nextRetryAt: { $exists: false } },
          { nextRetryAt: null },
          { nextRetryAt: { $lte: now } }
        ]
      }).limit(10);

      for (const item of items) {
        item.status = 'PROCESSING';
        item.lastAttemptAt = now;
        item.attempts += 1;
        await item.save();

        try {
          await this.sendEmail({
            recipient: item.recipient,
            cc: item.cc,
            bcc: item.bcc,
            subject: item.subject,
            htmlBody: item.htmlBody,
            textBody: item.textBody,
            templateCode: item.templateCode
          });
          item.status = 'SENT';
          item.sentAt = new Date();
          item.deliveryStatus = 'Success';
          await item.save();
        } catch (err) {
          item.errorLog.push(`Attempt ${item.attempts}: ${err.message}`);
          if (item.attempts >= item.maxAttempts) {
            item.status = 'FAILED';
            item.deliveryStatus = 'Failed after max attempts';
          } else {
            item.status = 'RETRYING';
            // Exponential backoff: 2^attempts minutes
            const backoffMinutes = Math.pow(2, item.attempts);
            item.nextRetryAt = new Date(now.getTime() + backoffMinutes * 60000);
          }
          await item.save();
        }
      }
    } catch (err) {
      logger.error('EmailService', 'Failed processing email queue', err);
    }
  }

  /**
   * Get logs with filtering & pagination
   */
  async getEmailLogs(query = {}, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const logs = await EmailLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await EmailLog.countDocuments(query);
    return { logs, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = new EmailService();
