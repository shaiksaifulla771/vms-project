import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

async function runTest() {
  console.log('=== REAL FIREBASE WEB SDK & API TEST ===\n');
  console.log('Project ID:', firebaseConfig.projectId);
  console.log('API Key:', firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 8)}...` : 'MISSING');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  console.log('\nAttempting signInWithEmailAndPassword for admin@vms.com...');
  try {
    const cred = await signInWithEmailAndPassword(auth, 'admin@vms.com', 'Admin123456!');
    console.log('Firebase Auth Success! UID:', cred.user.uid);
    console.log('Email Verified:', cred.user.emailVerified);

    const token = await cred.user.getIdToken();
    console.log('Fetched ID Token length:', token.length);

    console.log('\nSending GET http://127.0.0.1:5000/api/auth/me with Bearer token...');
    const res = await fetch('http://127.0.0.1:5000/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('HTTP Status:', res.status, res.statusText);
    const data = await res.json();
    console.log('Response JSON:', JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('ERROR:', err.code || err.message);
  }
}

runTest().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
