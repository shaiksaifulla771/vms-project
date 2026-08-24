const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authMiddleware');
const {
  getNetworkSummary,
  getSites,
  createSite,
  getSiteDeactivationImpact,
  toggleSiteStatus,
  getWarehouses,
  createWarehouse,
  transferWarehouseSite,
  unlinkWarehouseSite,
  getWarehouseDeactivationImpact,
  toggleWarehouseStatus,
  getAuditLogs,
  getActiveUsersAndSessions,
  updateUserAccess,
  toggleUserAccountStatus
} = require('../controllers/adminController');

// All admin routes require Admin role
router.use(authorize('Admin'));

// 1. Control Center Dashboard Summary
router.get('/network-summary', getNetworkSummary);

// 2. Sites Management & Deactivation Impact
router.get('/sites', getSites);
router.post('/sites', createSite);
router.get('/sites/:id/impact', getSiteDeactivationImpact);
router.post('/sites/:id/status', toggleSiteStatus);
router.put('/sites/:id/status', toggleSiteStatus);
router.put('/sites/:id/toggle-status', toggleSiteStatus);

// 3. Warehouses Management, Site Transfer & Impact
router.get('/warehouses', getWarehouses);
router.post('/warehouses', createWarehouse);
router.post('/warehouses/:id/transfer-site', transferWarehouseSite);
router.put('/warehouses/:id/transfer', transferWarehouseSite);
router.post('/warehouses/:id/unlink-site', unlinkWarehouseSite);
router.put('/warehouses/:id/unlink', unlinkWarehouseSite);
router.get('/warehouses/:id/impact', getWarehouseDeactivationImpact);
router.post('/warehouses/:id/status', toggleWarehouseStatus);
router.put('/warehouses/:id/status', toggleWarehouseStatus);
router.put('/warehouses/:id/toggle-status', toggleWarehouseStatus);

// 4. Enterprise Audit Trail & Filters
router.get('/audit-logs', getAuditLogs);

// 5. Active Users & Login History
router.get('/active-users', getActiveUsersAndSessions);

// 6. User Permissions, Location Scope & Status Toggling
router.put('/users/:userId/access', updateUserAccess);
router.put('/users/:userId/access-scope', updateUserAccess);
router.put('/users/:userId/toggle-status', toggleUserAccountStatus);

module.exports = router;

