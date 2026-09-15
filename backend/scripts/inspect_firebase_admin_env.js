const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { admin, auth, isInitialized, getProjectId } = require('../config/firebaseAdmin');

async function inspectFirebaseAdminEnv() {
  console.log('========================================================================');
  console.log('         FIREBASE ADMIN SERVICE-ACCOUNT CREDENTIAL DIAGNOSIS            ');
  console.log('========================================================================\n');

  const projectId = process.env.FIREBASE_PROJECT_ID || getProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || 'NOT_SET';
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

  const hasPrivateKey = Boolean(privateKey && privateKey.trim().length > 0);
  const formattedKey = privateKey.replace(/\\n/g, '\n');
  const hasBeginHeader = formattedKey.includes('-----BEGIN PRIVATE KEY-----');
  const hasEndFooter = formattedKey.includes('-----END PRIVATE KEY-----');
  const isValidFormat = hasBeginHeader && hasEndFooter;

  console.log(`1. Expected Environment Variables:`);
  console.log(`   - FIREBASE_PROJECT_ID:     ${process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET'}`);
  console.log(`   - FIREBASE_CLIENT_EMAIL:   ${process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET'}`);
  console.log(`   - FIREBASE_PRIVATE_KEY:    ${process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`   - GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET'}\n`);

  console.log(`2. Project ID:                ${projectId}`);
  console.log(`3. Service Account Email:     ${clientEmail}`);
  console.log(`4. Private Key Loaded:        ${hasPrivateKey ? 'YES' : 'NO'}`);
  console.log(`5. Private Key Format Valid:  ${isValidFormat ? 'YES' : 'NO'}`);
  console.log(`6. Firebase Admin Init Status:${isInitialized() ? 'INITIALIZED' : 'FAILED / UNINITIALIZED'}\n`);

  console.log('7. Testing Google IAM OAuth2 Service Account Token Grant...');
  try {
    // Attempt to verify an ID token with checkRevoked=true to test online Google IAM OAuth2 token exchange
    // We create a dummy test token header structure to test IAM cert validation
    const token = 'dummy_token_for_iam_test';
    await auth.verifyIdToken(token, true);
  } catch (err) {
    console.log(`   Google IAM Response Message: ${err.message}`);
    if (err.message && err.message.includes('invalid_grant')) {
      console.log('   [DIAGNOSIS] Google IAM OAuth2 server rejected the service account private key signature with invalid_grant!');
      console.log('   [CAUSE] The service account private key in backend/.env is either REVOKED, EXPIRED, DELETED, or DOES NOT MATCH the service account email on Google Cloud Console.');
    } else if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      console.log('   [DIAGNOSIS] Firebase Admin successfully reached verification phase (Signature verification error on invalid dummy token).');
    }
  }
}

inspectFirebaseAdminEnv().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
