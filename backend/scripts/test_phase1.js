const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { firebaseAdminApp, isInitialized, getProjectId } = require('../config/firebaseAdmin');
const request = require('supertest');
const app = require('../app');

async function testPhase1() {
  console.log('--- EXECUTING PHASE 1 CREDENTIAL VERIFICATION TESTS ---');

  // Test 1: Firebase Project ID correctness
  const projectId = getProjectId();
  console.log(`1. Testing Firebase Project ID: '${projectId}'...`);
  if (projectId !== 'vendor-management-system-b1791') {
    throw new Error(`Project ID mismatch! Expected 'vendor-management-system-b1791', got '${projectId}'`);
  }
  console.log('   [PASS] Project ID is correctly configured as vendor-management-system-b1791');

  // Test 2: Firebase Admin Initialization Status & Real Credentials
  console.log('2. Testing Firebase Admin App initialization status...');
  if (!firebaseAdminApp) {
    throw new Error('Firebase Admin app instance is null or undefined!');
  }

  const initialized = isInitialized();
  console.log(`   Firebase Admin isInitialized status: ${initialized}`);
  if (!initialized) {
    throw new Error('Firebase Admin SDK did not initialize with cert credentials!');
  }
  console.log('   [PASS] Firebase Admin App initialized with cert credentials successfully');

  // Test 3: Backend API Health check
  console.log('3. Testing Express Backend API Health endpoint (/api/health)...');
  const res = await request(app).get('/api/health');
  if (res.status !== 200 || res.body.status !== 'ok') {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  console.log('   [PASS] Express backend starts and responds with status ok');

  // Test 4: Verify existing Auth routes remain untouched and active
  console.log('4. Testing existing auth routes compatibility (Phase 2 not started)...');
  const authRes = await request(app).post('/api/auth/login').send({});
  if (authRes.status !== 400 || authRes.body.error !== 'Please provide an email and password') {
    throw new Error(`Unexpected auth response: ${JSON.stringify(authRes.body)}`);
  }
  console.log('   [PASS] Existing custom JWT login behavior remains active and untouched');

  console.log('--- ALL PHASE 1 VERIFICATION TESTS PASSED SUCCESSFULLY ---');
}

testPhase1().then(() => process.exit(0)).catch(err => {
  console.error('Phase 1 Verification Failed:', err);
  process.exit(1);
});
