/**
 * Centralized authorization helpers for VMS User & Access Control
 */

/**
 * Checks if a user has Global Platform Administrator privileges.
 * @param {Object} user - User document or payload
 * @returns {Boolean}
 */
exports.isGlobalAdmin = (user) => {
  if (!user || typeof user !== 'object') return false;
  const r = (user.role || '').toLowerCase().trim();
  return r === 'admin';
};

/**
 * Checks if a role is a management-level oversight role capable of viewing facility-wide scopes.
 * @param {Object|String} userOrRole
 * @returns {Boolean}
 */
exports.isManagementRole = (userOrRole) => {
  const role = typeof userOrRole === 'object' ? userOrRole?.role : userOrRole;
  if (!role) return false;
  const r = role.toLowerCase().trim();
  return r === 'admin' || r === 'inventory manager' || r === 'production manager' || r === 'planner';
};
