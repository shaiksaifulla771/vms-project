const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Frontend Web SDK Configuration (exact same as frontend/.env)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyCsPfpAH-W9XF_1dwiEQ6ADcaFUQ59OIUI",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "vendor-management-system-b1791.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "vendor-management-system-b1791",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "vendor-management-system-b1791.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "169406214309",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:169406214309:web:e9e28541b15aaba9e49d4c"
};

async function simulateBrowserAuth() {
  console.log('========================================================================');
  console.log('       REAL BROWSER AUTHENTICATION FLOW SIMULATION (WEB SDK)           ');
  console.log('========================================================================\n');

  console.log('1. Initializing Firebase Web SDK...');
  const app = initializeApp(firebaseConfig);
  const webAuth = getAuth(app);
  console.log('   Firebase Web SDK Initialized successfully.\n');

  console.log('2. Executing signInWithEmailAndPassword for admin@vms.com...');
  try {
    const userCredential = await signInWithEmailAndPassword(webAuth, 'admin@vms.com', 'Admin123456!');
    console.log(`   [PASS] Firebase Auth Success! User UID: ${userCredential.user.uid}`);
    console.log(`   [PASS] Email Verified: ${userCredential.user.emailVerified}\n`);

    console.log('3. Fetching live Firebase ID Token via getIdToken()...');
    const idToken = await userCredential.user.getIdToken(true);
    console.log(`   [PASS] ID Token Generated (Length: ${idToken.length} chars)\n`);

    console.log('4. Sending HTTP GET http://127.0.0.1:5000/api/auth/me with Bearer token...');
    const res = await fetch('http://127.0.0.1:5000/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`   HTTP Status Code: ${res.status} ${res.statusText}`);
    const json = await res.json();
    console.log('   JSON Response Body:', JSON.stringify(json, null, 2));

    if (res.status === 200 && json.success) {
      console.log('\n========================================================================');
      console.log(' RESULT: FULL END-TO-END BROWSER AUTHENTICATION SUCCESSFUL! ');
      console.log('========================================================================');
    } else {
      console.error('\n========================================================================');
      console.error(' RESULT: BACKEND REJECTED BROWSER AUTHENTICATION REQUEST!');
      console.error('========================================================================');
    }

  } catch (err) {
    console.error('   [FAIL] Error during authentication flow:', err.message);
    if (err.code) console.error('   Firebase Error Code:', err.code);
  }
}

simulateBrowserAuth().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
