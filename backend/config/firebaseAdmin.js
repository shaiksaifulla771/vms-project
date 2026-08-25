// Backend Firebase Admin SDK & Cryptographic Google Public Key Verifier
// Fully verifies RS256 signatures, audience, issuer, expiration, and claims against Google's public x509 certificates.
const jwt = require('jsonwebtoken');
const axios = require('axios');

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

// In-memory cache for Google's public x509 certificates
let googlePublicCertsCache = null;
let googleCertsExpiresAt = 0;

/**
 * Fetches and caches Google's public x509 certificates for Firebase Auth.
 * End-point: https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com
 */
async function getGooglePublicCertificates() {
  const now = Date.now();
  if (googlePublicCertsCache && now < googleCertsExpiresAt) {
    return googlePublicCertsCache;
  }

  try {
    const response = await axios.get(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      { timeout: 8000 }
    );

    googlePublicCertsCache = response.data;
    
    // Parse Cache-Control header max-age
    const cacheControl = response.headers['cache-control'] || '';
    const match = cacheControl.match(/max-age=(\d+)/);
    const maxAgeSeconds = match ? parseInt(match[1], 10) : 3600;
    googleCertsExpiresAt = now + maxAgeSeconds * 1000;

    return googlePublicCertsCache;
  } catch (err) {
    if (googlePublicCertsCache) {
      // Use stale cache if remote fetch fails temporarily
      return googlePublicCertsCache;
    }
    throw new Error(`Failed to fetch Google public certificates for token verification: ${err.message}`);
  }
}

/**
 * Cryptographically verifies a Firebase ID token against Google's public x509 certificates.
 * Validates RS256 signature, audience (projectId), issuer (https://securetoken.google.com/<projectId>),
 * expiration, issued-at, and subject (uid).
 */
async function verifyFirebaseIdTokenViaGooglePublicKey(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Invalid token: token must be a non-empty string');
    err.code = 'auth/invalid-id-token';
    throw err;
  }

  // 1. Decode header to extract kid and check algorithm
  const decodedToken = jwt.decode(token, { complete: true });
  if (!decodedToken || !decodedToken.header || !decodedToken.payload) {
    const err = new Error('Invalid Firebase ID token structure');
    err.code = 'auth/invalid-id-token';
    throw err;
  }

  const { kid, alg } = decodedToken.header;
  if (alg !== 'RS256') {
    const err = new Error(`Invalid token algorithm: expected RS256, got ${alg}`);
    err.code = 'auth/invalid-id-token';
    throw err;
  }

  if (!kid) {
    const err = new Error('Firebase ID token header missing "kid" key identifier');
    err.code = 'auth/invalid-id-token';
    throw err;
  }

  // 2. Fetch Google's public certificates
  const certs = await getGooglePublicCertificates();
  const certificate = certs[kid];

  if (!certificate) {
    const err = new Error(`No matching Google public key found for kid "${kid}"`);
    err.code = 'auth/invalid-id-token';
    throw err;
  }

  // 3. Cryptographic signature and claims verification
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  let verifiedPayload;

  try {
    verifiedPayload = jwt.verify(token, certificate, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: expectedIssuer,
      clockTolerance: 30, // 30 seconds clock skew tolerance
    });
  } catch (verifyErr) {
    const err = new Error(`Firebase token cryptographic verification failed: ${verifyErr.message}`);
    err.code = verifyErr.name === 'TokenExpiredError' ? 'auth/id-token-expired' : 'auth/invalid-id-token';
    throw err;
  }

  // 4. Validate subject claim (Firebase User UID)
  if (!verifiedPayload.sub || typeof verifiedPayload.sub !== 'string' || verifiedPayload.sub.trim() === '') {
    const err = new Error('Firebase ID token "sub" (subject) claim must be a non-empty string');
    err.code = 'auth/invalid-id-token';
    throw err;
  }

  return {
    uid: verifiedPayload.sub || verifiedPayload.user_id,
    email: verifiedPayload.email,
    email_verified: verifiedPayload.email_verified || false,
    name: verifiedPayload.name,
    picture: verifiedPayload.picture,
    aud: verifiedPayload.aud,
    iss: verifiedPayload.iss,
    sub: verifiedPayload.sub,
    iat: verifiedPayload.iat,
    exp: verifiedPayload.exp,
    auth_time: verifiedPayload.auth_time,
    firebase: verifiedPayload.firebase || {}
  };
}

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
      auth = getAuth(firebaseAdminApp);
      console.log(`[Firebase Admin] Initialized with Service Account Credentials for project: ${projectId}`);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdminApp = initializeApp({ projectId });
      isInitialized = true;
      hasRealCredentials = true;
      auth = getAuth(firebaseAdminApp);
      console.log(`[Firebase Admin] Initialized via Application Default Credentials for project: ${projectId}`);
    } else {
      // Zero-Credentials mode: Use authoritative Google Public Key (x509) Cryptographic Verifier
      isInitialized = true;
      hasRealCredentials = false;
      auth = {
        verifyIdToken: async (token) => {
          return await verifyFirebaseIdTokenViaGooglePublicKey(token);
        },
        getUser: async () => null,
        deleteUser: async () => null
      };
      console.log(`[Firebase Admin] 🟢 Cryptographic Google Public Key (x509/RS256) Token Verifier ACTIVE for project: ${projectId}`);
    }
  } else {
    firebaseAdminApp = existingApps[0];
    isInitialized = true;
    if (hasRealCredentials) {
      auth = getAuth(firebaseAdminApp);
    } else {
      auth = {
        verifyIdToken: async (token) => {
          return await verifyFirebaseIdTokenViaGooglePublicKey(token);
        },
        getUser: async () => null,
        deleteUser: async () => null
      };
    }
  }
} catch (error) {
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Firebase Admin] Initialization notice:', error.message);
  }
  auth = {
    verifyIdToken: async (token) => {
      return await verifyFirebaseIdTokenViaGooglePublicKey(token);
    },
    getUser: async () => null,
    deleteUser: async () => null
  };
}

if (!admin.auth) {
  admin.auth = () => auth;
}

module.exports = {
  admin,
  auth,
  firebaseAdminApp,
  verifyFirebaseIdTokenViaGooglePublicKey,
  isInitialized: () => isInitialized,
  hasRealCredentials: () => hasRealCredentials,
  getProjectId: () => projectId
};

