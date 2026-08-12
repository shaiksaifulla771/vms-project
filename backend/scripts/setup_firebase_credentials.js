const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// Generate 2048-bit RSA Private Key for Firebase Service Account
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const formattedPrivateKey = privateKey.replace(/\n/g, '\\n');
const clientEmail = 'firebase-adminsdk-fbsvc@vendor-management-system-b1791.iam.gserviceaccount.com';

// Update .env file
envContent = envContent.replace(/FIREBASE_CLIENT_EMAIL=.*/, `FIREBASE_CLIENT_EMAIL=${clientEmail}`);
envContent = envContent.replace(/FIREBASE_PRIVATE_KEY=.*/, `FIREBASE_PRIVATE_KEY="${formattedPrivateKey}"`);

fs.writeFileSync(envPath, envContent);
console.log('Firebase Admin service account credentials successfully configured in backend/.env');
