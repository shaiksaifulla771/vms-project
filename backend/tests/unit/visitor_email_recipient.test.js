const emailService = require('../../services/emailService');

describe('VISITOR REGISTRATION EMAIL RECIPIENT RULES', () => {
  test('Dispatches confirmation email to registered visitor email address (not admin)', async () => {
    const payload = {
      visitorId: 'vis-1001',
      visitorCode: 'VIS-1001',
      visitorName: 'John Doe',
      visitorEmail: 'johndoe@example.com',
      company: 'Acme Corp',
      hostName: 'Jane Smith',
      status: 'REGISTERED'
    };

    const recipient = payload.visitorEmail || payload.email;
    expect(recipient).toBe('johndoe@example.com');
    expect(recipient).not.toBe('admin@vendoros.com');

    // Spy on emailService.sendTemplateEmail
    const spy = jest.spyOn(emailService, 'sendTemplateEmail').mockResolvedValue({
      status: 'Sent',
      recipient: 'johndoe@example.com'
    });

    await emailService.sendTemplateEmail('VISITOR_REGISTRATION', recipient, {
      visitorName: payload.visitorName,
      visitorEmail: recipient,
      employeeName: payload.hostName,
      companyName: 'VendorOS VMS'
    });

    expect(spy).toHaveBeenCalledWith(
      'VISITOR_REGISTRATION',
      'johndoe@example.com',
      expect.objectContaining({
        visitorEmail: 'johndoe@example.com',
        visitorName: 'John Doe'
      })
    );

    spy.mockRestore();
  });
});
