const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const express = require('express');
const app = require('../app');
const { runCutoverAudit } = require('./phase9_auth_cutover_audit');
const { diagnoseFirebaseCredentials } = require('./diagnose_firebase_credentials');

async function runPhase11DeploymentSuite() {
  console.log('========================================================================');
  console.log('  PHASE 11: PRODUCTION DEPLOYMENT & INFRASTRUCTURE READINESS SUITE    ');
  console.log('========================================================================\n');

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

  // 1. Healthcheck Endpoint Verification
  console.log('1. Testing Production Health Endpoint GET /health...');
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const healthRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      }).on('error', reject);
    });

    assert(healthRes.status === 200, 'GET /health returns HTTP 200 OK');
    assert(healthRes.body.status === 'ok', 'Health status is ok');
    assert(Boolean(healthRes.body.timestamp), 'Health response contains timestamp');
  } finally {
    server.close();
  }

  // 2. Production Firebase Admin Credentials
  console.log('\n2. Testing Firebase Admin Live OAuth Connectivity...');
  const diag = await diagnoseFirebaseCredentials();
  assert(diag.success === true, 'Firebase Admin SDK connected cleanly to project vendor-management-system-b1791');

  // 3. User Identity & Authorization Preservation Check
  console.log('\n3. Verifying Cutover User Identity & Authorization Snapshot...');
  const audit = await runCutoverAudit();
  assert(audit.totalUsers === 14, 'Total inspected MongoDB users is 14');
  assert(audit.withFirebaseUid === 14, '14/14 users possess verified linked firebaseUid');
  assert(audit.activeWithoutFirebaseUid === 0, '0 ACTIVE users lack firebaseUid');

  // 4. Feature Flag LEGACY_JWT_AUTH_ENABLED=false
  console.log('\n4. Verifying Legacy JWT Feature Flag Disabled State...');
  assert(process.env.LEGACY_JWT_AUTH_ENABLED === 'false', 'LEGACY_JWT_AUTH_ENABLED is false in production configuration');

  console.log(`\n=== ALL ${passed}/${total} PHASE 11 DEPLOYMENT TEST SCENARIOS PASSED SUCCESSFULLY ===`);
}

runPhase11DeploymentSuite().then(() => process.exit(0)).catch(err => {
  console.error('Phase 11 Suite Error:', err.message);
  process.exit(1);
});
