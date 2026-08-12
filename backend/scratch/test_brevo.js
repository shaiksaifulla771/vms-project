const dotenv = require('dotenv');
dotenv.config();

const emailService = require('../services/emailService');
const EmailLog = require('../models/EmailLog');
const connectDB = require('../config/db');

async function testBrevo() {
  await connectDB();
  console.log('Testing Brevo API email dispatch...');
  console.log('BREVO_API_KEY prefix:', process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.substring(0, 15) : 'NONE');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);

  try {
    const result = await emailService.sendEmail({
      recipient: 'shaiksaifulla771@gmail.com',
      subject: 'Test Email from VendorOS VMS',
      textBody: 'Hello, this is a test email to verify Brevo integration.',
      htmlBody: '<h2>Test Email</h2><p>Hello, this is a test email from VendorOS VMS.</p>'
    });

    console.log('Dispatch result status:', result.status);
    console.log('Error message if any:', result.error);
    console.log('Message ID:', result.messageId);
  } catch (err) {
    console.error('Test script error:', err.message);
  }
  process.exit(0);
}

testBrevo();
