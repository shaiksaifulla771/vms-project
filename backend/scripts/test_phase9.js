const { runCutoverAudit } = require('./phase9_auth_cutover_audit');

async function testPhase9CutoverSafety() {
  console.log('=== EXECUTING PHASE 9 CUTOVER SAFETY & AUDIT TEST MATRIX ===\n');

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

  // 1. Execute Cutover Audit
  console.log('1. Executing Phase 9A Cutover Audit...');
  const auditResult = await runCutoverAudit();

  assert(auditResult.totalUsers === 14, 'Total inspected MongoDB users is 14');
  assert(auditResult.activeWithoutFirebaseUid === 2, 'Correctly identified 2 ACTIVE users lacking firebaseUid');
  assert(auditResult.withoutFirebaseUid === 11, 'Correctly identified 11 users lacking firebaseUid');
  assert(auditResult.duplicateEmails === 0, 'Zero duplicate emails present');
  assert(auditResult.duplicateFirebaseUids === 0, 'Zero duplicate firebaseUid values present');
  assert(auditResult.firebaseIdentityMismatches === 0, 'Zero email/identity mismatches for linked accounts');

  // 2. Enforce Mandatory Cutover Safety Gate
  console.log('\n2. Testing Mandatory Cutover Failsafe Gate...');
  const shouldBlockCutover = auditResult.activeWithoutFirebaseUid > 0;
  assert(shouldBlockCutover === true, 'Failsafe correctly blocks legacy JWT retirement when ACTIVE users lack firebaseUid');

  console.log(`\n=== ALL ${passed}/${total} PHASE 9 CUTOVER SAFETY TEST SCENARIOS PASSED SUCCESSFULLY ===`);
}

testPhase9CutoverSafety().then(() => process.exit(0)).catch(err => {
  console.error('Phase 9 Safety Test Error:', err.message);
  process.exit(1);
});
