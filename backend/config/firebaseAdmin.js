// Backend Firebase Admin SDK initialization
// Enhanced with development-mode decode fallback for environments without service account credentials.
const jwt = require('jsonwebtoken');

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
let hasRealCredentials = false;

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
      hasRealCredentials = true;
      console.log(`[Firebase Admin] Initialized successfully with cert credentials for project: ${projectId}`);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdminApp = initializeApp({
        projectId
      });
      isInitialized = true;
      hasRealCredentials = true;
      console.log(`[Firebase Admin] Initialized via Application Default Credentials for project: ${projectId}`);
    } else {
      // No real credentials available — initialize app but mark as no-credentials
      firebaseAdminApp = initializeApp({
        projectId
      });
      isInitialized = true;
      hasRealCredentials = false;
      console.warn(`[Firebase Admin] WARNING: No service account credentials found.`);
      console.warn(`[Firebase Admin] verifyIdToken will use DEVELOPMENT decode-only fallback.`);
      console.warn(`[Firebase Admin] To fix: Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env`);
    }
  } else {
    firebaseAdminApp = existingApps[0];
    isInitialized = true;
  }

  if (hasRealCredentials) {
    // Use real Firebase Admin Auth with full cryptographic verification
    auth = firebaseAdminApp ? getAuth(firebaseAdminApp) : null;
  } else {
    // Development-only: Create a wrapper that tries real verification first,
    // and falls back to JWT decode if credentials fail
    const realAuth = firebaseAdminApp ? getAuth(firebaseAdminApp) : null;
    
    auth = {
      verifyIdToken: async (token, checkRevoked = false) => {
        // 1. Try real verification first (works if GOOGLE_CLOUD_PROJECT is set correctly)
        if (realAuth) {
          try {
            return await realAuth.verifyIdToken(token, checkRevoked);
          } catch (realErr) {
            // Real verification failed due to missing credentials — fall through to decode
            if (process.env.NODE_ENV === 'production') {
              throw realErr; // NEVER bypass in production
            }
            console.warn(`[Firebase Admin] verifyIdToken failed (${realErr.code || realErr.message}). Using dev decode fallback.`);
          }
        }

        // 2. DEVELOPMENT ONLY: Decode the JWT without signature verification
        // This extracts the claims (sub, email, email_verified, etc.) from a real Firebase token
        // but does NOT cryptographically verify it. Only safe behind localhost.
        if (process.env.NODE_ENV === 'production') {
          const err = new Error('Firebase Admin credentials required in production');
          err.code = 'auth/invalid-id-token';
          throw err;
        }

        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.payload) {
          const err = new Error('Invalid Firebase ID token format');
          err.code = 'auth/invalid-id-token';
          throw err;
        }

        const payload = decoded.payload;
        
        // Basic sanity checks even in dev mode
        if (!payload.sub || !payload.email) {
          const err = new Error('Token missing required claims (sub, email)');
          err.code = 'auth/invalid-id-token';
          throw err;
        }

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          const err = new Error('Firebase ID token has expired');
          err.code = 'auth/id-token-expired';
          throw err;
        }

        console.warn(`[Firebase Admin] DEV MODE: Decoded token for ${payload.email} without signature verification.`);
        
        return {
          uid: payload.sub || payload.user_id,
          email: payload.email,
          email_verified: payload.email_verified || false,
          name: payload.name,
          picture: payload.picture,
          aud: payload.aud,
          iss: payload.iss,
          sub: payload.sub,
          iat: payload.iat,
          exp: payload.exp,
          auth_time: payload.auth_time,
          firebase: payload.firebase || {}
        };
      },
      getUser: async (uid) => {
        console.warn(`[Firebase Admin] DEV MODE: getUser(${uid}) returning null (no credentials)`);
        return null;
      },
      deleteUser: async (uid) => {
        console.warn(`[Firebase Admin] DEV MODE: deleteUser(${uid}) is a no-op (no credentials)`);
        return null;
      }
    };
  }
} catch (error) {
  // Graceful fallback for test runners (e.g. Jest CJS) or environments without Firebase credentials
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Firebase Admin] Initialization error:', error.message);
  }
}

// Fallback stub if auth was not instantiated at all
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
  hasRealCredentials: () => hasRealCredentials,
  getProjectId: () => projectId
};
