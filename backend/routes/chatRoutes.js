const express = require('express');
const { ask } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/ask', protect, ask);

module.exports = router;
