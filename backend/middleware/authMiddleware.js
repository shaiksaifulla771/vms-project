const jwt = require('jsonwebtoken');
const User = require('../models/User');
const getJwtSecret = require('../config/jwt');
const { admin, auth } = require('../config/firebaseAdmin');

// Protect routes using Dual-Engine Verification (Native Backend JWT + Firebase ID Token)
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
  }

  // Validate token is a plausible JWT structure before processing
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    return res.status(401).json({ success: false, error: 'Invalid token format' });
  }

  // 1. First attempt: Native Backend Signed JWT Token
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded && decoded.id) {
      const user = await User.findById(decoded.id).select('+refreshTokenHash');
      if (user) {
        const status = (user.accountStatus || '').toUpperCase();
        if (status !== 'ACTIVE' && status !== 'APPROVED' && user.role !== 'Admin') {
          return res.status(403).json({
            success: false,
            error: 'Account access denied. Contact your administrator.',
            accountStatus: user.accountStatus,
          });
        }
        req.user = user;
        return next();
      }
    }
  } catch (jwtErr) {
    // If native JWT verification failed (e.g. signature mismatch), proceed to Firebase verification
  }

  // 2. Second attempt: Firebase Admin SDK ID Token Verification
  try {
    const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
    if (!firebaseAuth) {
      return res.status(401).json({ success: false, error: 'Authentication service unavailable' });
    }

    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(token, true); // check revocation
    } catch (revocationErr) {
      if (revocationErr.code === 'auth/id-token-revoked') {
        return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
      }
      decodedToken = await firebaseAuth.verifyIdToken(token, false);
    }

    // Server-Side Email Verification Check
    if (decodedToken.email_verified !== true) {
      return res.status(403).json({
        success: false,
        error: 'Email verification required. Please verify your email before accessing VMS API.',
        requireVerification: true,
        accountStatus: 'EMAIL_UNVERIFIED',
      });
    }

    // Query MongoDB user by indexed firebaseUid
    const user = await User.findOne({ firebaseUid: decodedToken.uid })
      .select('+refreshTokenHash')
      .lean(false);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User record not found in VMS database' });
    }

    if (!user.emailVerified) {
      User.findByIdAndUpdate(user._id, { emailVerified: true }).catch(() => {});
    }

    const status = (user.accountStatus || '').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'APPROVED' && user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Account access denied. Contact your administrator.',
        accountStatus: user.accountStatus,
      });
    }

    req.user = user;
    req.firebaseToken = decodedToken;
    next();
  } catch (err) {
    if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
    }
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
    }
    console.error(`[AUTH] Token validation error for IP ${req.ip}: ${err.code || err.message}`);
    return res.status(401).json({ success: false, error: 'Authentication failed. Please log in again.' });
  }
};

// Standard RBAC — requires protect() to have run first
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};

exports.checkRole = exports.authorize;

// Row-Level Security: Enforce Site-specific data access
exports.enforceSiteAccess = (siteIdParam = 'siteId') => {
  return (req, res, next) => {
    const targetSiteId = req.params[siteIdParam] || req.body[siteIdParam] || req.query[siteIdParam];

    if (!targetSiteId || req.user.role === 'Admin') return next();

    const userSiteIds = req.user.siteIds || [];
    const hasAccess = userSiteIds.some(id => id.toString() === targetSiteId.toString());

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to access data for this site.' });
    }

    next();
  };
};
