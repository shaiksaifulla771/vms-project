const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const mongoose = require('mongoose');
const authController = require('../controllers/authController');
const { runCutoverAudit } = require('./phase9_auth_cutover_audit');

async function testPhase9bCutover() {
  console.log('=== EXECUTING PHASE 9B CONTROLLED CUTOVER TEST SUITE ===\n');

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

  // 1. Audit pre-cutover state
  console.log('1. Executing Phase 9B Pre-cutover Audit Verification...');
  const auditRes = await runCutoverAudit();
  assert(auditRes.totalUsers === 14, 'Total inspected MongoDB users is 14');
  assert(auditRes.withFirebaseUid === 14, '14/14 users have valid linked firebaseUid');
  assert(auditRes.activeWithoutFirebaseUid === 0, '0 ACTIVE users lack firebaseUid');
  assert(auditRes.duplicateFirebaseUids === 0, '0 duplicate firebaseUid values');

  // 2. Test LEGACY_JWT_AUTH_ENABLED=false Behavior
  console.log('\n2. Testing Feature Flag LEGACY_JWT_AUTH_ENABLED=false...');
  process.env.LEGACY_JWT_AUTH_ENABLED = 'false';

  const mockReq = { body: { email: 'admin@vms.com', password: 'Password123!' } };
  let resStatus = null;
  let resJson = null;

  const mockRes = {
    status: (code) => {
      resStatus = code;
      return {
        json: (data) => { resJson = data; }
      };
    }
  };

  await authController.login(mockReq, mockRes, () => {});

  assert(resStatus === 403, 'Legacy login returns 403 Forbidden when LEGACY_JWT_AUTH_ENABLED=false');
  assert(resJson && resJson.success === false, 'Returns success: false');
  assert(resJson && resJson.error.includes('disabled'), 'Returns generic disabled message');
  assert(!JSON.stringify(resJson).includes('jwt') && !JSON.stringify(resJson).includes('secret'), 'No JWT implementation details exposed');

  // 3. Test Rollback Capability (LEGACY_JWT_AUTH_ENABLED=true)
  console.log('\n3. Testing Rollback Capability (LEGACY_JWT_AUTH_ENABLED=true)...');
  process.env.LEGACY_JWT_AUTH_ENABLED = 'true';

  let rollbackResStatus = null;
  let rollbackResJson = null;

  const mockResRollback = {
    status: (code) => {
      rollbackResStatus = code;
      return {
        json: (data) => { rollbackResJson = data; }
      };
    },
    cookie: () => {}
  };

  // Re-run login under feature flag = true
  await authController.login(mockReq, mockResRollback, () => {});
  assert(rollbackResStatus !== 403 || (rollbackResJson && !rollbackResJson.error.includes('disabled')), 'Rollback allows legacy login path to evaluate when feature flag is true');

  // Reset feature flag to false for production cutover
  process.env.LEGACY_JWT_AUTH_ENABLED = 'false';

  console.log(`\n=== ALL ${passed}/${total} PHASE 9B CUTOVER TEST SCENARIOS PASSED SUCCESSFULLY ===`);
}

testPhase9bCutover().then(() => process.exit(0)).catch(err => {
  console.error('Phase 9B Cutover Test Error:', err);
  process.exit(1);
});
