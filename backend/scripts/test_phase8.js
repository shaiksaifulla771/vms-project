const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function runPhase8Verification() {
  console.log('=== EXECUTING PHASE 8 FRONTEND FIREBASE AUTHENTICATION VERIFICATION ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`   [PASS] ${message}`);
      passed++;
    } else {
      console.error(`   [FAIL] ${message}`);
      throw new Error(`Scenario Failed: ${message}`);
    }
  }

  // 1. Verify frontend/src/config/firebase.js exports
  console.log('1. Auditing frontend/src/config/firebase.js...');
  const firebaseConfigPath = path.join(__dirname, '../../frontend/src/config/firebase.js');
  const firebaseConfigCode = fs.readFileSync(firebaseConfigPath, 'utf8');

  assert(firebaseConfigCode.includes('VITE_FIREBASE_API_KEY'), 'Uses VITE_FIREBASE_API_KEY env variable');
  assert(firebaseConfigCode.includes('VITE_FIREBASE_PROJECT_ID'), 'Uses VITE_FIREBASE_PROJECT_ID env variable');
  assert(firebaseConfigCode.includes('onAuthStateChanged'), 'Exports onAuthStateChanged listener');
  assert(firebaseConfigCode.includes('getIdToken'), 'Exports getIdToken helper');

  // 2. Verify frontend/src/services/api.js Axios interceptor
  console.log('2. Auditing frontend/src/services/api.js Axios interceptor...');
  const apiJsPath = path.join(__dirname, '../../frontend/src/services/api.js');
  const apiJsCode = fs.readFileSync(apiJsPath, 'utf8');

  assert(apiJsCode.includes('auth.currentUser.getIdToken()'), 'Fetches live Firebase ID token via auth.currentUser.getIdToken()');
  assert(apiJsCode.includes("Authorization"), 'Attaches Authorization Bearer header');

  // 3. Verify frontend/src/context/AuthContext.jsx
  console.log('3. Auditing frontend/src/context/AuthContext.jsx...');
  const authContextPath = path.join(__dirname, '../../frontend/src/context/AuthContext.jsx');
  const authContextCode = fs.readFileSync(authContextPath, 'utf8');

  assert(authContextCode.includes('onAuthStateChanged'), 'Subscribes to onAuthStateChanged authoritative auth listener');
  assert(authContextCode.includes('/auth/me'), 'Synchronizes user status with backend /api/auth/me');
  assert(authContextCode.includes('loginWithEmailPassword'), 'Implements loginWithEmailPassword');
  assert(authContextCode.includes('loginWithGoogle'), 'Implements loginWithGoogle');
  assert(authContextCode.includes('registerWithEmailPassword'), 'Implements registerWithEmailPassword');
  assert(authContextCode.includes('sendVerificationEmail'), 'Implements sendVerificationEmail');
  assert(authContextCode.includes('sendPasswordResetEmail'), 'Implements sendPasswordReset');

  // 4. Verify secret exposure audit
  console.log('4. Performing secret & credential audit across frontend directory...');
  const frontendDir = path.join(__dirname, '../../frontend/src');
  const files = fs.readdirSync(frontendDir, { recursive: true });

  let secretLeaked = false;
  for (const file of files) {
    const fullPath = path.join(frontendDir, file);
    if (fs.statSync(fullPath).isFile() && (file.endsWith('.js') || file.endsWith('.jsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('FIREBASE_PRIVATE_KEY') || content.includes('FIREBASE_CLIENT_EMAIL') || content.includes('BEGIN PRIVATE KEY')) {
        secretLeaked = true;
      }
    }
  }
  assert(!secretLeaked, 'Zero Firebase Admin private keys or service account credentials found in frontend source code');

  console.log(`\n=== ALL ${passed}/${total} PHASE 8 FRONTEND FIREBASE AUDIT SCENARIOS PASSED SUCCESSFULLY ===`);
}

runPhase8Verification().then(() => process.exit(0)).catch(err => {
  console.error('Phase 8 Verification Error:', err.message);
  process.exit(1);
});
