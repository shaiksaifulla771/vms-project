const UserAccessAssignment = require('../models/UserAccessAssignment');
const authz = require('../utils/authz');

/**
 * Request-time location scope verification middleware.
 * Verifies caller has an active UserAccessAssignment matching the target scopeType & scopeId.
 * Bypasses checks for Global Admin.
 * 
 * @param {String} [scopeTypeParam='scopeType'] - Name of req param/body/query for scope type
 * @param {String} [scopeIdParam='scopeId'] - Name of req param/body/query for scope ID
 */
const checkScope = (scopeTypeParam = 'scopeType', scopeIdParam = 'scopeId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // Global Administrator bypasses location-specific scoping
      if (authz.isGlobalAdmin(req.user)) {
        return next();
      }

      const scopeType = req.params[scopeTypeParam] || req.body[scopeTypeParam] || req.query[scopeTypeParam];
      const scopeId = req.params[scopeIdParam] || req.body[scopeIdParam] || req.query[scopeIdParam];

      if (!scopeType || !scopeId) {
        return res.status(400).json({ success: false, error: 'scopeType and scopeId are required to verify scope access' });
      }

      const now = new Date();
      const hasActiveAssignment = await UserAccessAssignment.exists({
        userId: req.user._id,
        scopeType,
        scopeId,
        status: 'active',
        $or: [
          { effectiveUntil: null },
          { effectiveUntil: { $gt: now } }
        ]
      });

      if (!hasActiveAssignment) {
        return res.status(403).json({
          success: false,
          error: `Access denied. You do not have an active assignment to this ${scopeType} (${scopeId}).`
        });
      }

      next();
    } catch (err) {
      console.error('[checkScope error]:', err.message);
      return res.status(500).json({ success: false, error: 'Scope access verification failed' });
    }
  };
};

module.exports = checkScope;
