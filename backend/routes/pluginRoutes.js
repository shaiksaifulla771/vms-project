const express = require('express');
const router = express.Router();
const pluginController = require('../controllers/pluginController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', pluginController.getPlugins);
router.post('/:code/enable', authorize('Admin'), pluginController.enablePlugin);
router.post('/:code/disable', authorize('Admin'), pluginController.disablePlugin);
router.get('/:code/health', pluginController.checkPluginHealth);

module.exports = router;
