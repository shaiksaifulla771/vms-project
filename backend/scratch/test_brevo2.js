const dotenv = require('dotenv');
dotenv.config();

const emailService = require('../services/emailService');
const connectDB = require('../config/db');

async function testBrevo() {
  await connectDB();
  console.log('Testing Brevo API with sender = shaiksaifulla771@gmail.com...');

  // Override EMAIL_FROM for this test
  process.env.EMAIL_FROM = 'shaiksaifulla771@gmail.com';

  try {
    const result = await emailService.sendEmail({
      recipient: 'shaiksaifulla771@gmail.com',
      subject: 'VMS Access Approval Notification Test',
      textBody: 'Hello Saifulla,\n\nYour VendorOS VMS access request has been approved.\n\nAssigned role: Production Manager\n\nRegards,\nVendorOS VMS Administration',
      htmlBody: '<h2>Access Approved</h2><p>Hello Saifulla,</p><p>Your VendorOS VMS access request has been approved.</p><p><strong>Assigned role:</strong> Production Manager</p>'
    });

    console.log('Dispatch status:', result.status);
    console.log('Error message if any:', result.error);
    console.log('Message ID:', result.messageId);
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

testBrevo();
