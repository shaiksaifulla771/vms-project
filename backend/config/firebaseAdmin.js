// Backend Firebase Admin SDK initialization
const projectId = process.env.FIREBASE_PROJECT_ID || 'vendor-management-system-b1791';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let admin = {};
let auth = null;
let firebaseAdminApp = null;
let isInitialized = false;

try {
  const firebaseAdmin = require('firebase-admin');
  const { cert, getApps, initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');

  admin = firebaseAdmin;

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

  auth = firebaseAdminApp ? getAuth(firebaseAdminApp) : null;
} catch (error) {
  // Graceful fallback for test runners (e.g. Jest CJS) or environments without Firebase credentials
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Firebase Admin] Initialization error:', error.message);
  }
}

// Fallback stub if auth was not instantiated
if (!auth) {
  auth = {
    verifyIdToken: async () => {
      const err = new Error('Firebase Admin Auth not initialized');
      err.code = 'auth/invalid-id-token';
      throw err;
    },
    getUser: async () => null,
    deleteUser: async () => null,
  };
}

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
