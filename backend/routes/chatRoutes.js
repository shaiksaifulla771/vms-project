const express = require('express');
const { ask, stream, applyAction } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');
const { writeLimiter, readLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Require authentication for AI assistant routes
router.use(protect);

router.post('/ask', readLimiter, ask);
router.post('/stream', readLimiter, stream);
router.post('/apply-action', writeLimiter, applyAction);

module.exports = router;
