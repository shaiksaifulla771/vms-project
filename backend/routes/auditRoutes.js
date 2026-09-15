const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All audit endpoints require authentication and explicit role-based access control (RBAC)
router.get('/logs', protect, authorize('Admin', 'Finance'), auditController.getAuditLogs);
router.get('/export', protect, authorize('Admin', 'Finance'), auditController.exportAuditLogs);
router.get('/entity/:type/:id', protect, authorize('Admin', 'Finance'), auditController.getEntityHistory);
router.post('/verify-integrity', protect, authorize('Admin'), auditController.verifyIntegrity);
router.put('/:id/legal-hold', protect, authorize('Admin'), auditController.setLegalHold);

module.exports = router;
