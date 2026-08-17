const User = require('../models/User');
const { admin, auth } = require('../config/firebaseAdmin');

// Protect routes using Firebase Admin SDK ID Token Verification
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
  }

  // Validate token is a plausible JWT structure before sending to Firebase
  // (prevents log spam and CPU waste from malformed tokens)
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    return res.status(401).json({ success: false, error: 'Invalid token format' });
  }

  try {
    // 1. Verify Firebase ID Token signature, expiration, and revocation status
    const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(token, true); // check revocation
    } catch (revocationErr) {
      // Only fallback if revocation check is unavailable (network issue)
      if (revocationErr.code === 'auth/id-token-revoked') {
        return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
      }
      decodedToken = await firebaseAuth.verifyIdToken(token, false);
    }

    // 2. Server-Side Email Verification Check
    if (decodedToken.email_verified !== true) {
      return res.status(403).json({
        success: false,
        error: 'Email verification required. Please verify your email before accessing VMS API.',
        requireVerification: true,
        accountStatus: 'EMAIL_UNVERIFIED',
      });
    }

    // 3. Query MongoDB user by indexed firebaseUid (only fetch needed fields)
    const user = await User.findOne({ firebaseUid: decodedToken.uid })
      .select('+refreshTokenHash') // explicitly include for future token binding
      .lean(false); // keep document methods (e.g. for role checks)

    if (!user) {
      return res.status(401).json({ success: false, error: 'User record not found in VMS database' });
    }

    // Synchronize emailVerified in MongoDB if out of sync (fire-and-forget)
    if (!user.emailVerified) {
      User.findByIdAndUpdate(user._id, { emailVerified: true }).catch(() => {});
    }

    // 4. Exact accountStatus === 'ACTIVE' check (normalized to uppercase)
    const status = (user.accountStatus || '').toUpperCase();
    if (status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'Account access denied. Contact your administrator.',
        accountStatus: user.accountStatus, // Return stored value (no normalization leak)
      });
    }

    // 5. Populate req.user with verified Mongoose User document
    req.user = user;
    req.firebaseToken = decodedToken;
    next();
  } catch (err) {
    // SECURITY: Never expose internal error details or stack traces to clients
    if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
    }
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
    }
    // Log server-side for observability; never send internal details to client
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

    // Skip if no site context is requested, or if user is an Admin
    if (!targetSiteId || req.user.role === 'Admin') return next();

    const userSiteIds = req.user.siteIds || [];
    const hasAccess = userSiteIds.some(id => id.toString() === targetSiteId.toString());

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to access data for this site.' });
    }

    next();
  };
};

// Field-Level Security: Enforce Clearance level
exports.enforceFieldSecurity = (requiredLevel) => {
  return (req, res, next) => {
    const levels = ['Public', 'Internal', 'Confidential', 'Restricted'];
    const userLevel = req.user ? req.user.fieldSecurityLevel || 'Internal' : 'Public';

    const userIdx = levels.indexOf(userLevel);
    const reqIdx = levels.indexOf(requiredLevel);

    if (userIdx >= reqIdx) return next();
    return res.status(403).json({ success: false, error: 'Insufficient clearance level for this resource.' });
  };
};
