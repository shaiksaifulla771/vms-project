const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const firebaseAdminModule = require('../config/firebaseAdmin');

async function diagnoseFirebaseCredentials() {
  console.log('=== FIREBASE ADMIN CREDENTIAL DIAGNOSIS ===\n');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const hasPrivateKey = Boolean(process.env.FIREBASE_PRIVATE_KEY);

  console.log(`Node Version:             ${process.version}`);
  console.log(`Configured Project ID:   ${projectId}`);
  console.log(`Has Client Email:        ${Boolean(clientEmail)} (${clientEmail ? clientEmail.split('@')[1] || 'domain' : 'missing'})`);
  console.log(`Has Private Key:         ${hasPrivateKey}`);
  console.log(`SDK Initialized State:   ${firebaseAdminModule.isInitialized()}`);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  try {
    console.log('\nTesting live Google OAuth / Firebase Auth API connectivity...');
    // Harmless test lookup
    await authTarget.getUserByEmail('non_existent_test_probe_12345@example.com');
    console.log('[SUCCESS] Live Firebase Auth API connected successfully!');
    return { success: true, errorCategory: 'NONE' };
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log('[SUCCESS] Live Firebase Auth API connected successfully! (User not found as expected)');
      return { success: true, errorCategory: 'NONE' };
    }

    console.error(`\n[DIAGNOSTIC ERROR] Firebase API call failed: ${err.message}`);
    let category = 'UNKNOWN_ERROR';
    if (err.message.includes('invalid_grant') || err.message.includes('Invalid JWT Signature')) {
      category = 'INVALID_GOOGLE_OAUTH_GRANT';
    } else if (err.code === 'app/invalid-credential') {
      category = 'INVALID_SERVICE_ACCOUNT';
    } else if (err.message.includes('permission') || err.code === 'auth/insufficient-permission') {
      category = 'PERMISSION_DENIED';
    }

    console.error(`Categorized Error: ${category}`);
    return { success: false, errorCategory: category, rawMessage: err.message };
  }
}

if (require.main === module) {
  diagnoseFirebaseCredentials().then(() => process.exit(0)).catch(err => {
    console.error('Diagnosis Script Failure:', err);
    process.exit(1);
  });
}

module.exports = { diagnoseFirebaseCredentials };
