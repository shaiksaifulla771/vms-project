const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/send', emailController.sendEmail);
router.post('/send-template', emailController.sendTemplateEmail);
router.get('/templates', emailController.getTemplates);
router.get('/queue', emailController.getQueue);
router.get('/logs', emailController.getLogs);
router.post('/queue/:id/retry', authorize('Admin'), emailController.retryQueueItem);

module.exports = router;
