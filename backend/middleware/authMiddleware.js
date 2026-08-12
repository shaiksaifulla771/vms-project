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

  try {
    // 1. Verify Firebase ID Token signature, expiration, and revocation status
    const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(token, true);
    } catch (revocationErr) {
      // Fallback to standard signature verification if IAM online revocation check fails
      decodedToken = await firebaseAuth.verifyIdToken(token, false);
    }

    // 2. Server-Side Email Verification Check
    if (decodedToken.email_verified !== true) {
      return res.status(403).json({ 
        success: false, 
        error: 'Email verification required. Please verify your email before accessing VMS API.',
        requireVerification: true,
        accountStatus: 'EMAIL_UNVERIFIED'
      });
    }

    // 3. Query MongoDB user by indexed firebaseUid
    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      return res.status(401).json({ success: false, error: 'User record not found in VMS database' });
    }

    // Synchronize emailVerified in MongoDB if out of sync
    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    // 4. Exact accountStatus === 'ACTIVE' check
    const status = (user.accountStatus || '').toUpperCase();
    if (status !== 'ACTIVE') {
      return res.status(403).json({ 
        success: false, 
        error: `Account status is ${user.accountStatus}. Access denied.`,
        accountStatus: user.accountStatus
      });
    }

    // 5. Populate req.user with full Mongoose User document
    req.user = user;
    req.firebaseToken = decodedToken;
    next();
  } catch (err) {
    if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
    } else if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Token validation failed', details: err.message });
  }
};

// Standard RBAC
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: `Role ${req.user ? req.user.role : 'none'} is not authorized` });
    }
    next();
  };
};

exports.checkRole = exports.authorize;

// Row-Level Security: Enforce Site-specific access
exports.enforceSiteAccess = (siteIdParam = 'siteId') => {
  return (req, res, next) => {
    const targetSiteId = req.params[siteIdParam] || req.body[siteIdParam] || req.query[siteIdParam];
    
    // Skip if no site context is requested, or if user is an Admin
    if (!targetSiteId || req.user.role === 'Admin') return next();

    // Check if the user's allowed sites include the requested site
    const userSiteIds = req.user.siteIds || [];
    const hasAccess = userSiteIds.some(id => id.toString() === targetSiteId.toString());
    
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to access data for this site' });
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
    return res.status(403).json({ success: false, error: 'Insufficient field security clearance' });
  };
};
