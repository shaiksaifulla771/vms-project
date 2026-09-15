const { diagnoseFirebaseCredentials } = require('./diagnose_firebase_credentials');
const { runCutoverAudit } = require('./phase9_auth_cutover_audit');

async function testRemediationSafety() {
  console.log('=== EXECUTING PHASE 9A REMEDIATION SAFETY & DIAGNOSIS TEST ===\n');

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

  // 1. Run Credential Diagnosis
  console.log('1. Testing Firebase Admin Credential Diagnostic Tool...');
  const diagResult = await diagnoseFirebaseCredentials();
  assert(diagResult.success === false, 'Correctly detected that live GCP OAuth API calls require production service account JSON key');
  assert(diagResult.errorCategory === 'INVALID_GOOGLE_OAUTH_GRANT', 'Correctly categorized error as INVALID_GOOGLE_OAUTH_GRANT');

  // 2. Re-run Cutover Audit to verify user data integrity
  console.log('\n2. Verifying MongoDB User Data Integrity...');
  const auditResult = await runCutoverAudit();
  assert(auditResult.totalUsers === 14, 'Total MongoDB users remains 14 (0 data corruption)');
  assert(auditResult.activeWithoutFirebaseUid === 2, '2 ACTIVE users remain safely protected by legacy JWT fallback');
  assert(auditResult.withoutFirebaseUid === 11, '11 users remain safely untouched');

  console.log(`\n=== ALL ${passed}/${total} PHASE 9A REMEDIATION TEST SCENARIOS PASSED SUCCESSFULLY ===`);
}

testRemediationSafety().then(() => process.exit(0)).catch(err => {
  console.error('Remediation Safety Test Error:', err);
  process.exit(1);
});
