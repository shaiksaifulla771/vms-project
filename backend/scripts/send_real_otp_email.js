const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const emailService = require('../services/emailService');
const connectDB = require('../config/db');

async function sendTestOtp() {
  await connectDB();
  const recipient = 'shaiksaifulla771@gmail.com';
  const testOtp = '7294';

  const res = await emailService.sendEmail({
    recipient,
    subject: 'Your 4-Digit VMS Verification Code',
    textBody: `Welcome to VendorOS VMS. Your verification code is ${testOtp}. This code expires in 10 minutes.`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#2563eb;margin-top:0">VendorOS VMS Verification</h2>
        <p>Hello <strong>Saifulla</strong>,</p>
        <p>Please enter this 4-digit code to verify your email address and submit your access request:</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e293b">${testOtp}</span>
        </div>
        <p style="color:#64748b;font-size:14px">This verification code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">Once verified, your account request will be forwarded to the System Administrator for role assignment and activation.</p>
      </div>
    `,
    templateCode: 'AUTH_REGISTRATION_OTP'
  });

  console.log('✅ Real OTP Email Sent Successfully!');
  console.log('Status:', res.status);
  console.log('Message ID:', res.messageId);
  const mongoose = require('mongoose');
  await mongoose.disconnect();
}

sendTestOtp();
