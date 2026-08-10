const express = require('express');
const router = express.Router();
const mcpController = require('../controllers/mcpController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/tools', mcpController.getAvailableTools);
router.post('/execute', mcpController.executeTool);

module.exports = router;
