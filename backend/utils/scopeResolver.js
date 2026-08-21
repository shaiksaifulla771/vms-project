const UserAccessAssignment = require('../models/UserAccessAssignment');

/**
 * Resolves all active site, warehouse, and plant scopes for a user.
 * Implements deployment-safe fallback branching gated by READ_FROM_LEGACY_FIELDS.
 * 
 * @param {Object} user - User document
 * @returns {Promise<{siteIds: Array, warehouseIds: Array, plantIds: Array, assignments: Array}>}
 */
exports.getUserAssignedScopes = async (user) => {
  if (!user || !user._id) {
    return { siteIds: [], warehouseIds: [], plantIds: [], assignments: [] };
  }

  // Rollback / Transition window fallback branch
  if (process.env.READ_FROM_LEGACY_FIELDS === 'true') {
    const legacySites = Array.isArray(user.siteIds) ? user.siteIds.map(s => s._id || s) : [];
    const legacyWarehouses = Array.isArray(user.warehouseIds) ? user.warehouseIds.map(w => w._id || w) : [];
    return {
      siteIds: legacySites,
      warehouseIds: legacyWarehouses,
      plantIds: [],
      assignments: []
    };
  }

  // Canonical branch: Read directly from indexed UserAccessAssignment
  const now = new Date();
  const assignments = await UserAccessAssignment.find({
    userId: user._id,
    status: 'active',
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: now } }
    ]
  }).lean();

  const siteIds = assignments.filter(a => a.scopeType === 'site').map(a => a.scopeId);
  const warehouseIds = assignments.filter(a => a.scopeType === 'warehouse').map(a => a.scopeId);
  const plantIds = assignments.filter(a => a.scopeType === 'manufacturingPlant').map(a => a.scopeId);

  return {
    siteIds,
    warehouseIds,
    plantIds,
    assignments
  };
};
