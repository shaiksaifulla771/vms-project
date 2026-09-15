const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const emailService = require('../services/emailService');
const connectDB = require('../config/db');

async function testLiveEmail() {
  console.log('======================================================');
  console.log('      TESTING LIVE BREVO SMTP EMAIL DISPATCH          ');
  console.log('======================================================');

  await connectDB();

  const recipient = 'shaiksaifulla771@gmail.com';
  console.log(`Sending live test email to: ${recipient}...`);
  console.log(`SMTP Host: ${process.env.SMTP_HOST}`);
  console.log(`SMTP User: ${process.env.SMTP_USER}`);

  try {
    const log = await emailService.sendEmail({
      recipient,
      subject: '✅ VendorOS VMS — Live Brevo SMTP Test Successful',
      textBody: 'Congratulations! Your Brevo Transactional SMTP integration for VendorOS VMS is working successfully.',
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#2563eb;margin-top:0">VendorOS VMS — Brevo Email Connected</h2>
          <p>Hello <strong>Saifulla</strong>,</p>
          <p>This is a live test email confirming that your Brevo SMTP integration with VendorOS VMS is active and delivering transactional emails.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:0 0 8px 0"><strong>Status:</strong> <span style="color:#15803d;font-weight:bold">DELIVERED VIA BREVO SMTP</span></p>
            <p style="margin:0 0 8px 0"><strong>Host:</strong> smtp-relay.brevo.com (Port 587)</p>
            <p style="margin:0"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>Registration OTPs, Admin Approval emails, and Visitor Notifications will now arrive directly in your inbox!</p>
          <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">VendorOS Enterprise VMS</p>
        </div>
      `,
      templateCode: 'LIVE_TEST'
    });

    console.log('\n[RESULT]: Email Log Doc:', log);
    if (log.status === 'Sent') {
      console.log('\n🎉 SUCCESS! Live test email successfully sent to', recipient);
    } else {
      console.log('\n⚠️ Dispatch status:', log.status, 'Error:', log.error);
    }
  } catch (err) {
    console.error('\n❌ Failed to dispatch test email:', err.message);
  } finally {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
  }
}

testLiveEmail();
