const jwt = require('jsonwebtoken');
const User = require('../models/User');
const getJwtSecret = require('../config/jwt');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    // Global Revocation Check
    // If tokenVersion in DB was incremented (via logout, password reset, or admin revoke),
    // existing JWT is immediately invalidated.
    const userTokenVersion = (user.tokenVersion !== undefined && user.tokenVersion !== null) ? user.tokenVersion : 0;
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== userTokenVersion) {
      return res.status(401).json({ success: false, error: 'Token revoked or expired. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token validation failed' });
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
