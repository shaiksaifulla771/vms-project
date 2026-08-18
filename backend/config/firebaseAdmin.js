const admin = require('firebase-admin');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Backend Firebase Admin SDK initialization
const projectId = process.env.FIREBASE_PROJECT_ID || 'vendor-management-system-b1791';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let firebaseAdminApp = null;
let isInitialized = false;

try {
  const existingApps = getApps();
  if (existingApps.length === 0) {
    if (clientEmail && privateKey) {
      firebaseAdminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        }),
        projectId
      });
      isInitialized = true;
      console.log(`[Firebase Admin] Initialized successfully with cert credentials for project: ${projectId}`);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdminApp = initializeApp({
        projectId
      });
      isInitialized = true;
      console.log(`[Firebase Admin] Initialized via Application Default Credentials for project: ${projectId}`);
    } else {
      firebaseAdminApp = initializeApp({
        projectId
      });
      isInitialized = true;
      console.log(`[Firebase Admin] Initialized in development mode for project: ${projectId}`);
    }
  } else {
    firebaseAdminApp = existingApps[0];
    isInitialized = true;
  }
} catch (error) {
  console.error('[Firebase Admin] Initialization error:', error.message);
}

const auth = firebaseAdminApp ? getAuth(firebaseAdminApp) : getAuth();

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
