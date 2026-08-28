const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/send', authorize('Admin', 'Manager'), emailController.sendEmail);
router.post('/send-template', authorize('Admin', 'Manager'), emailController.sendTemplateEmail);
router.get('/templates', authorize('Admin', 'Manager'), emailController.getTemplates);
router.get('/queue', authorize('Admin'), emailController.getQueue);
router.get('/logs', authorize('Admin'), emailController.getLogs);
router.post('/queue/:id/retry', authorize('Admin'), emailController.retryQueueItem);

module.exports = router;
