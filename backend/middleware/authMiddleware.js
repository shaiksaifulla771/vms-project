const jwt = require('jsonwebtoken');
const User = require('../models/User');
const getJwtSecret = require('../config/jwt');
const { admin, auth } = require('../config/firebaseAdmin');
const authz = require('../utils/authz');
const scopeResolver = require('../utils/scopeResolver');

// In-Memory Live User Status Cache (8-second bounded TTL across multi-instance nodes)
const statusCache = new Map(); // Key: userId (String) -> { status, role, expiresAt }
const STATUS_CACHE_TTL_MS = 8000;
const STATUS_CACHE_MAX_SIZE = 2000;

/**
 * Invalidate user status cache immediately on write operations (deactivate, approve, suspend)
 * @param {String|ObjectId} userId
 */
exports.invalidateUserStatusCache = (userId) => {
  if (userId) {
    statusCache.delete(String(userId));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// No-login mode (login page removed)
// AUTH_DISABLED defaults to ON outside production. Requests without a bearer
// token run as an "acting user": the ACTIVE user named in the X-User-Id header
// (chosen in the UI's user switcher), otherwise the first ACTIVE Admin.
// RBAC still applies to the acting user's role. In production it must be
// enabled explicitly with AUTH_DISABLED=true.
// ─────────────────────────────────────────────────────────────────────────────
const isAuthDisabled = () => {
  const flag = (process.env.AUTH_DISABLED || '').toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  // production and test runs keep real auth unless explicitly disabled
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return flag === 'true' || flag === '1';
  return true;
};
exports.isAuthDisabled = isAuthDisabled;

const ACTIVE_STATUSES = ['ACTIVE', 'Active', 'APPROVED'];

async function resolveActingUser(req) {
  const requestedId = req.headers['x-user-id'];
  if (requestedId && /^[a-f0-9]{24}$/i.test(String(requestedId))) {
    const u = await User.findOne({ _id: requestedId, accountStatus: { $in: ACTIVE_STATUSES } });
    if (u) return u;
  }
  let admin = await User.findOne({ role: 'Admin', accountStatus: { $in: ACTIVE_STATUSES } }).sort({ createdAt: 1 });
  if (!admin) {
    // Fresh database: create a local system administrator so the app is usable
    admin = await User.create({
      username: 'System Admin',
      email: 'admin@local.erp',
      role: 'Admin',
      accountStatus: 'ACTIVE',
      emailVerified: true,
    });
  }
  return admin;
}
exports.resolveActingUser = resolveActingUser;

// Protect routes using Dual-Engine Verification (Native Backend JWT + Firebase ID Token)
exports.protect = async (req, res, next) => {
  if (req.user) return next(); // already resolved by an upstream protect()

  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token && isAuthDisabled()) {
    try {
      req.user = await resolveActingUser(req);
      req.authMode = 'acting-user';
      return next();
    } catch (e) {
      return res.status(500).json({ success: false, error: `Could not resolve acting user: ${e.message}` });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
  }

  // Validate token structure
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    return res.status(401).json({ success: false, error: 'Invalid token format' });
  }

  let authenticatedUser = null;
  let decodedPayload = null;

  // 1. First attempt: Native Backend Signed JWT Token
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded && decoded.id) {
      const user = await User.findById(decoded.id).select('+refreshTokenHash');
      if (user) {
        if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion < user.tokenVersion) {
          return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
        }
        authenticatedUser = user;
        decodedPayload = decoded;
      }
    }
  } catch (jwtErr) {
    // Proceed to Firebase verification if native token failed
  }

  // 2. Second attempt: Firebase Admin SDK ID Token Verification
  if (!authenticatedUser) {
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

      if (decodedToken.email_verified !== true) {
        return res.status(403).json({
          success: false,
          error: 'Email verification required. Please verify your email before accessing VMS API.',
          requireVerification: true,
          accountStatus: 'EMAIL_UNVERIFIED',
        });
      }

      const user = await User.findOne({ firebaseUid: decodedToken.uid })
        .select('+refreshTokenHash')
        .lean(false);

      if (!user) {
        return res.status(401).json({ success: false, error: 'User record not found in VMS database' });
      }

      if (!user.emailVerified) {
        User.findByIdAndUpdate(user._id, { emailVerified: true }).catch(() => {});
      }

      authenticatedUser = user;
      req.firebaseToken = decodedToken;
    } catch (err) {
      if (err.code === 'auth/id-token-revoked') {
        return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
      }
      if (err.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ success: false, error: 'Authentication failed. Please log in again.' });
    }
  }

  if (!authenticatedUser) {
    return res.status(401).json({ success: false, error: 'Authentication failed. User record not found.' });
  }

  // 3. Live Account Status Check with Bounded 8s TTL In-Memory Cache
  const userIdStr = String(authenticatedUser._id);
  const now = Date.now();
  let cachedStatus = statusCache.get(userIdStr);

  if (!cachedStatus || now > cachedStatus.expiresAt) {
    const liveCheck = await User.findById(userIdStr).select('accountStatus role approvalStatus').lean();
    if (!liveCheck) {
      return res.status(401).json({ success: false, error: 'User account no longer exists.' });
    }
    cachedStatus = {
      status: (liveCheck.accountStatus || '').toUpperCase(),
      approvalStatus: (liveCheck.approvalStatus || '').toUpperCase(),
      role: liveCheck.role,
      expiresAt: now + STATUS_CACHE_TTL_MS
    };
    if (statusCache.size >= STATUS_CACHE_MAX_SIZE) {
      statusCache.clear();
    }
    statusCache.set(userIdStr, cachedStatus);
  }

  if (cachedStatus.status === 'DEACTIVATED' || cachedStatus.status === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      error: 'Account has been deactivated or suspended.',
      accountStatus: cachedStatus.status
    });
  }

  // Admin check: Only ACTIVE or APPROVED Admin accounts can access endpoints
  const isGlobalAdmin = authz.isGlobalAdmin(cachedStatus) && (cachedStatus.status === 'ACTIVE' || cachedStatus.status === 'APPROVED');
  const isActive = cachedStatus.status === 'ACTIVE' || cachedStatus.status === 'APPROVED';

  if (!isActive) {
    return res.status(403).json({
      success: false,
      error: 'Account access denied. Your account is pending administrator approval or inactive.',
      accountStatus: cachedStatus.status,
      approvalStatus: cachedStatus.approvalStatus
    });
  }

  req.user = authenticatedUser;
  next();
};

/**
 * Standard RBAC Authorization middleware
 * @param {Array<String>} roles - Allowed roles
 */
exports.requireRole = (...roleArgs) => {
  // Accept both authorize('Admin', 'Manager') and authorize(['Admin', 'Manager']).
  // (Previously only the array form worked; the varargs form silently kept the
  // first role as a *string*, turning `.includes()` into a substring match.)
  const allowedRoles = roleArgs.flat().filter(Boolean);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (authz.isGlobalAdmin(req.user) || allowedRoles.includes(req.user.role)) {
      return next();
    }
    // Legacy 'Editor' users (from the old 3-role model) may perform any
    // non-Admin-only action.
    if (req.user.role === 'Editor' && allowedRoles.some(r => r !== 'Admin')) {
      return next();
    }
    // 'Manager' is a superset of the specific manager roles
    if (req.user.role === 'Manager' && allowedRoles.some(r => /manager/i.test(r))) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to perform this action.'
    });
  };
};

exports.authorize = exports.requireRole;
exports.checkRole = exports.requireRole;

/**
 * Dual Authorization: Validates caller role OR caller matching the target user ID
 * @param {Array<String>} allowedRoles
 */
exports.requireRoleOrSelf = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (authz.isGlobalAdmin(req.user)) {
      return next();
    }
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }
    const targetUserId = String(req.params.userId || req.body.userId || req.query.userId || '');
    if (targetUserId && String(req.user._id) === targetUserId) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: 'Not authorized to access scope assignments for this user.'
    });
  };
};

/**
 * Row-Level Security: Enforces Site-specific data access using scopeResolver
 */
exports.enforceSiteAccess = (siteIdParam = 'siteId') => {
  return async (req, res, next) => {
    const targetSiteId = req.params[siteIdParam] || req.body[siteIdParam] || req.query[siteIdParam];

    if (!targetSiteId || authz.isGlobalAdmin(req.user)) return next();

    const { siteIds } = await scopeResolver.getUserAssignedScopes(req.user);
    const hasAccess = siteIds.some(id => String(id) === String(targetSiteId));

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to access data for this site.' });
    }

    next();
  };
};

/**
 * Server-Side Cost Redaction Middleware (Section 13 & Spec Update)
 */
function redactCostFields(obj) {
  if (!obj || typeof obj !== 'object') return;

  const costKeys = ['unitCost', 'unit_cost', 'requiredCost', 'required_cost', 'expectedCost', 'actualCost', 'totalCost', 'basePrice', 'standardCost'];

  if (Array.isArray(obj)) {
    for (const item of obj) {
      redactCostFields(item);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (costKeys.includes(key)) {
        obj[key] = undefined;
        delete obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redactCostFields(obj[key]);
      }
    }
  }
}

exports.sanitizeCostData = (req, res, next) => {
  const allowedCostRoles = [
    'Admin',
    'Production Manager',
    'Manager',
    'Approver',
    'ProcurementManager',
    'Buyer',
    'Purchaser',
    'Manager — Purchasing'
  ];
  const userRole = req.user?.role || '';
  const canViewCost = authz.isGlobalAdmin(req.user) || allowedCostRoles.includes(userRole) || (req.user?.permissions && req.user.permissions.includes('VIEW_COST_DATA'));

  if (canViewCost) {
    return next();
  }

  const originalJson = res.json;
  res.json = function (body) {
    if (body && typeof body === 'object') {
      redactCostFields(body);
    }
    return originalJson.call(this, body);
  };

  next();
};

exports.redactCostFields = redactCostFields;
