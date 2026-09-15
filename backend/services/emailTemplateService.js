const EmailTemplate = require('../models/EmailTemplate');
const logger = require('../utils/logger');

class EmailTemplateService {
  /**
   * Seed default VMS email templates if they don't exist
   */
  async seedDefaultTemplates() {
    const defaultTemplates = [
      {
        templateCode: 'VISITOR_REGISTRATION',
        name: 'Visitor Registration Confirmation',
        subject: 'Welcome to {{companyName}} - Visitor Registration Confirmation',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Hello {{visitorName}},</h2>
            <p>Your visitor registration at <strong>{{companyName}}</strong> has been received successfully.</p>
            <p><strong>Host:</strong> {{employeeName}}</p>
            <p><strong>Appointment Date:</strong> {{appointmentDate}} at {{appointmentTime}}</p>
            <p><strong>Status:</strong> <span style="color: #2563eb;">{{status}}</span></p>
            <hr />
            <p style="font-size: 12px; color: #666;">Vendor Management System (VMS) Automatic Notification</p>
          </div>
        `,
        textBody: 'Hello {{visitorName}}, Your visitor registration at {{companyName}} is {{status}}.',
        variables: ['visitorName', 'visitorEmail', 'employeeName', 'appointmentDate', 'appointmentTime', 'status', 'companyName'],
        category: 'Visitor'
      },
      {
        templateCode: 'APPOINTMENT_APPROVED',
        name: 'Appointment Approved Notification',
        subject: 'Appointment Approved - {{companyName}}',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Appointment Approved!</h2>
            <p>Dear {{visitorName}},</p>
            <p>Your appointment with <strong>{{employeeName}}</strong> at {{companyName}} has been approved.</p>
            <p><strong>Date & Time:</strong> {{appointmentDate}} at {{appointmentTime}}</p>
            <p><a href="{{approvalLink}}" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Appointment Badge</a></p>
          </div>
        `,
        textBody: 'Dear {{visitorName}}, Your appointment with {{employeeName}} at {{companyName}} has been approved.',
        variables: ['visitorName', 'employeeName', 'appointmentDate', 'appointmentTime', 'companyName', 'approvalLink'],
        category: 'Appointment'
      },
      {
        templateCode: 'APPOINTMENT_REJECTED',
        name: 'Appointment Rejected Notification',
        subject: 'Appointment Request Update - {{companyName}}',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Appointment Request Status</h2>
            <p>Dear {{visitorName}},</p>
            <p>Regrettably, your appointment request with {{employeeName}} at {{companyName}} was not approved.</p>
            <p><strong>Reason:</strong> {{rejectionReason}}</p>
          </div>
        `,
        textBody: 'Dear {{visitorName}}, Your appointment request at {{companyName}} was not approved.',
        variables: ['visitorName', 'employeeName', 'companyName', 'rejectionReason'],
        category: 'Appointment'
      },
      {
        templateCode: 'VISITOR_CHECK_IN',
        name: 'Host Visitor Check-In Alert',
        subject: 'ALERT: Your Visitor {{visitorName}} Has Arrived',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Visitor Arrival Alert</h2>
            <p>Hello {{employeeName}},</p>
            <p>Your visitor <strong>{{visitorName}}</strong> from <em>{{companyName}}</em> has checked in at reception.</p>
          </div>
        `,
        textBody: 'Hello {{employeeName}}, Your visitor {{visitorName}} has checked in at reception.',
        variables: ['employeeName', 'visitorName', 'companyName'],
        category: 'Notification'
      },
      {
        templateCode: 'VISITOR_CHECK_OUT',
        name: 'Host Visitor Check-Out Notification',
        subject: 'Visitor {{visitorName}} Checked Out',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <p>Hello {{employeeName}},</p>
            <p>Your visitor <strong>{{visitorName}}</strong> has checked out.</p>
          </div>
        `,
        textBody: 'Hello {{employeeName}}, Your visitor {{visitorName}} has checked out.',
        variables: ['employeeName', 'visitorName'],
        category: 'Notification'
      }
    ];

    for (const tmpl of defaultTemplates) {
      await EmailTemplate.findOneAndUpdate(
        { templateCode: tmpl.templateCode },
        tmpl,
        { upsert: true, new: true }
      );
    }

    logger.info('EmailTemplateService', 'Default email templates seeded successfully.');
  }

  /**
   * Compile template text with dynamic variables
   */
  compileTemplate(content, variables = {}) {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const reg = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(reg, value !== undefined && value !== null ? value : '');
    }
    return result;
  }
}

module.exports = new EmailTemplateService();
