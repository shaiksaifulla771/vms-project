const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const emailTemplateService = require('../../services/emailTemplateService');
const emailService = require('../../services/emailService');

describe('VMS Email Service & Template Engine Unit Tests', () => {
  beforeAll(async () => {
    await connectDB();
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test('compileTemplate correctly interpolates template variables', () => {
    const template = 'Hello {{visitorName}}, welcome to {{companyName}}!';
    const variables = { visitorName: 'John Doe', companyName: 'VendorOS VMS' };
    const compiled = emailTemplateService.compileTemplate(template, variables);
    expect(compiled).toBe('Hello John Doe, welcome to VendorOS VMS!');
  });

  test('sendEmail records log and returns messageId', async () => {
    const result = await emailService.sendEmail({
      recipient: 'test@example.com',
      subject: 'Test Subject',
      htmlBody: '<p>Test</p>'
    });
    expect(result).toBeDefined();
    expect(result.recipient).toBe('test@example.com');
    expect(result.status).toBe('Sent');
    expect(result.messageId).toContain('MSG-');
  });

  test('sendTemplateEmail dispatches compiled template email', async () => {
    const result = await emailService.sendTemplateEmail('VISITOR_REGISTRATION', 'visitor@example.com', {
      visitorName: 'Alice',
      employeeName: 'Host Bob',
      appointmentDate: '2026-08-12',
      appointmentTime: '11:00 AM',
      status: 'Approved'
    });
    expect(result).toBeDefined();
    expect(result.recipient).toBe('visitor@example.com');
    expect(result.status).toBe('Sent');
  });
});
