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

async function testTokenVerificationModes() {
  console.log('=== TESTING FIREBASE ID TOKEN VERIFICATION MODES ===\n');

  const app = initializeApp(firebaseConfig);
  const webAuth = getAuth(app);

  const cred = await signInWithEmailAndPassword(webAuth, 'admin@vms.com', 'Admin123456!');
  const token = await cred.user.getIdToken(true);
  console.log('Firebase ID Token generated successfully.\n');

  console.log('Test 1: adminAuth.verifyIdToken(token, true) [checkRevoked = true]');
  try {
    const decoded1 = await adminAuth.verifyIdToken(token, true);
    console.log('   [PASS] verifyIdToken(token, true) succeeded! UID:', decoded1.uid);
  } catch (err1) {
    console.error('   [FAIL] verifyIdToken(token, true) failed:', err1.message);
  }

  console.log('\nTest 2: adminAuth.verifyIdToken(token, false) [checkRevoked = false]');
  try {
    const decoded2 = await adminAuth.verifyIdToken(token, false);
    console.log('   [PASS] verifyIdToken(token, false) succeeded! UID:', decoded2.uid, '| Email Verified:', decoded2.email_verified);
  } catch (err2) {
    console.error('   [FAIL] verifyIdToken(token, false) failed:', err2.message);
  }
}

testTokenVerificationModes().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
