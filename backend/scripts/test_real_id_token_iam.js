const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { auth: adminAuth } = require('../config/firebaseAdmin');

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyCsPfpAH-W9XF_1dwiEQ6ADcaFUQ59OIUI",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "vendor-management-system-b1791.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "vendor-management-system-b1791",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "vendor-management-system-b1791.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "169406214309",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:169406214309:web:e9e28541b15aaba9e49d4c"
};

async function testRealIdTokenIam() {
  console.log('=== TESTING REAL FIREBASE ID TOKEN WITH GOOGLE IAM REVOCATION CHECK ===\n');

  const app = initializeApp(firebaseConfig);
  const webAuth = getAuth(app);

  const cred = await signInWithEmailAndPassword(webAuth, 'admin@vms.com', 'Admin123456!');
  const realToken = await cred.user.getIdToken(true);

  console.log('Generated fresh real Firebase ID token.\n');

  console.log('Testing adminAuth.verifyIdToken(realToken, true) [Online IAM Revocation Check]...');
  try {
    const decoded = await adminAuth.verifyIdToken(realToken, true);
    console.log('   [SUCCESS] Online IAM Revocation Check PASSED! User UID:', decoded.uid);
    console.log('   [RESULT] Service account private key is 100% VALID and ACTIVE in Google IAM!');
  } catch (err) {
    console.error('   [FAIL] Online IAM Revocation Check FAILED:', err.message);
    if (err.message.includes('invalid_grant')) {
      console.error('   [RESULT] Service account private key is INVALID/REVOKED in Google IAM!');
    }
  }
}

testRealIdTokenIam().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
