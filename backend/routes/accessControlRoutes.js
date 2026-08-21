const express = require('express');
const router = express.Router();
const accessControlController = require('../controllers/accessControlController');
const { protect, requireRole, requireRoleOrSelf } = require('../middleware/authMiddleware');
const checkScope = require('../middleware/checkScope');

// All routes require authentication
router.use(protect);

/**
 * =========================================================================
 * ACCESS CONTROL & SCOPE GOVERNANCE ROUTE MATRIX
 * =========================================================================
 * 
 * | Method | Endpoint Path                              | Enforcement Middleware                  | Allowed Roles / Scopes |
 * |--------|--------------------------------------------|-----------------------------------------|------------------------|
 * | POST   | /api/access/assign                         | requireRole(['Admin'])                  | Admin only             |
 * | POST   | /api/access/transfer                       | requireRole(['Admin'])                  | Admin only             |
 * | POST   | /api/access/unlink                         | requireRole(['Admin'])                  | Admin only             |
 * | POST   | /api/access/bulk-assign                    | requireRole(['Admin'])                  | Admin only (Max 100)   |
 * | POST   | /api/access/bulk-deactivate                | requireRole(['Admin'])                  | Admin only (Max 100)   |
 * | GET    | /api/access/user/:userId                   | requireRoleOrSelf(['Admin', Managers])  | Admin, Mgrs, TargetUser|
 * | GET    | /api/access/scope/:scopeType/:scopeId/users| requireRole(['Admin', Managers]) + Scope| Admin, Scope Manager   |
 * | GET    | /api/access/notifications                  | requireRole(['Admin'])                  | Admin only             |
 * | PUT    | /api/access/notifications/:id/read         | requireRole(['Admin'])                  | Admin only             |
 * | POST   | /api/access/approvals/approve              | requireRole(['Admin'])                  | Admin only             |
 * | POST   | /api/access/approvals/reject               | requireRole(['Admin'])                  | Admin only             |
 * | POST   | /api/access/locations/deactivate           | requireRole(['Admin'])                  | Admin only             |
 * =========================================================================
 */

// 1. Assign Scope
router.post('/assign', requireRole(['Admin']), accessControlController.assignScope);

// 2. Transfer Scope
router.post('/transfer', requireRole(['Admin']), accessControlController.transferScope);

// 3. Unlink Scope
router.post('/unlink', requireRole(['Admin']), accessControlController.unlinkScope);

// 4. Bulk Operations
router.post('/bulk-assign', requireRole(['Admin']), accessControlController.bulkAssign);
router.post('/bulk-deactivate', requireRole(['Admin']), accessControlController.bulkDeactivate);

// 5. User Scope History (Self or Managers)
router.get('/user/:userId', requireRoleOrSelf(['Admin', 'Inventory Manager', 'Production Manager', 'Planner']), accessControlController.getUserAssignments);

// 6. Scope User Roster (IDOR-safe with chained checkScope)
router.get('/scope/:scopeType/:scopeId/users', requireRole(['Admin', 'Inventory Manager', 'Production Manager']), checkScope('scopeType', 'scopeId'), accessControlController.getScopeUsers);

// 7. Admin Notifications
router.get('/notifications', requireRole(['Admin']), accessControlController.getNotifications);
router.put('/notifications/:id/read', requireRole(['Admin']), accessControlController.markNotificationRead);

// 8. User Registration Lifecycle
router.post('/approvals/approve', requireRole(['Admin']), accessControlController.approveRegistration);
router.post('/approvals/reject', requireRole(['Admin']), accessControlController.rejectRegistration);

// 9. Location Deactivation
router.post('/locations/deactivate', requireRole(['Admin']), accessControlController.deactivateLocation);

module.exports = router;
