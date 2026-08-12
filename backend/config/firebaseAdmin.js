const admin = require('firebase-admin');
const { cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Backend-only Firebase Admin SDK initialization
const projectId = process.env.FIREBASE_PROJECT_ID || 'vendor-management-system-b1791';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  // Replace escaped newlines if passed as a single line string in .env
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let firebaseAdminApp = null;
let isInitialized = false;

try {
  const existingApps = admin.apps || (admin.default && admin.default.apps) || [];
  if (existingApps.length === 0) {
    if (clientEmail && privateKey) {
      const certObj = cert({
        projectId,
        clientEmail,
        privateKey
      });
      firebaseAdminApp = admin.initializeApp({
        credential: certObj,
        projectId
      });
      isInitialized = true;
      console.log(`[Firebase Admin] Initialized successfully with cert credentials for project: ${projectId}`);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdminApp = admin.initializeApp({
        projectId
      });
      isInitialized = true;
      console.log(`[Firebase Admin] Initialized via Application Default Credentials for project: ${projectId}`);
    } else {
      console.warn(`[Firebase Admin] Credentials not fully supplied in environment (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY missing). Project ID set to '${projectId}'.`);
      firebaseAdminApp = admin.initializeApp({
        projectId
      });
      isInitialized = false;
    }
  } else {
    firebaseAdminApp = admin.app();
    isInitialized = true;
  }
} catch (error) {
  console.error('[Firebase Admin] Initialization error:', error.message);
}

const auth = firebaseAdminApp ? getAuth(firebaseAdminApp) : getAuth();

// Attach fallback auth() method to admin for backward compatibility
if (!admin.auth) {
  admin.auth = () => auth;
}

module.exports = {
  admin,
  auth,
  firebaseAdminApp,
  isInitialized: () => isInitialized,
  getProjectId: () => projectId
};
