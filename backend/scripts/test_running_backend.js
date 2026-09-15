const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyCsPfpAH-W9XF_1dwiEQ6ADcaFUQ59OIUI",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "vendor-management-system-b1791.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "vendor-management-system-b1791",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "vendor-management-system-b1791.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "169406214309",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:169406214309:web:e9e28541b15aaba9e49d4c"
};

async function testRunningBackend() {
  console.log('=== TESTING RUNNING BACKEND AT HTTP://127.0.0.1:5000/API/AUTH/ME ===\n');

  const app = initializeApp(firebaseConfig);
  const webAuth = getAuth(app);

  const cred = await signInWithEmailAndPassword(webAuth, 'admin@vms.com', 'Admin123456!');
  const token = await cred.user.getIdToken(true);
  console.log('Generated fresh Firebase ID Token.\n');

  console.log('Sending GET http://127.0.0.1:5000/api/auth/me...');
  const res = await fetch('http://127.0.0.1:5000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log('HTTP Status:', res.status, res.statusText);
  const json = await res.json();
  console.log('Response Body:', JSON.stringify(json, null, 2));
}

testRunningBackend().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
