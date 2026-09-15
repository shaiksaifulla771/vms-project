const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/pending', protect, approvalController.getMyPending);
router.get('/workflows', protect, authorize('Admin'), approvalController.getWorkflows);
router.post('/workflows', protect, authorize('Admin'), approvalController.createWorkflow);
router.get('/:id', protect, approvalController.getApproval);
router.post('/:id/decide', protect, approvalController.submitDecision);

module.exports = router;
