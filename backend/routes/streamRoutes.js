const express = require('express');
const crypto = require('crypto');
const { protect } = require('../middleware/authMiddleware');
const { getSubClient, getRedisStatus } = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// In-memory store for one-time connection tokens (Ephemeral)
// In a multi-node setup, this could be stored in Redis with a short TTL (e.g., 30 seconds).
const connectionTokens = new Map();

/**
 * @route POST /api/stream/token
 * @desc Get a one-time connection token for SSE (Prevents JWT in URL)
 * @access Private
 */
router.post('/token', protect, (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  
  // Store the user context bound to this token
  connectionTokens.set(token, {
    userId: req.user._id,
    role: req.user.role,
    siteId: req.user.siteId,
    warehouseId: req.user.warehouseId,
    expiresAt: Date.now() + 30000 // 30 seconds to establish connection
  });

  // Cleanup expired tokens periodically to prevent memory leaks
  for (const [key, data] of connectionTokens.entries()) {
    if (Date.now() > data.expiresAt) {
      connectionTokens.delete(key);
    }
  }

  res.json({ success: true, token });
});

/**
 * @route GET /api/stream
 * @desc Establish Server-Sent Events (SSE) connection using connection token
 * @access Public (Token validated in query param instead of JWT)
 */
router.get('/', (req, res) => {
  const { token } = req.query;

  if (!token || !connectionTokens.has(token)) {
    return res.status(401).json({ success: false, error: 'Invalid or expired connection token' });
  }

  const sessionData = connectionTokens.get(token);
  
  if (Date.now() > sessionData.expiresAt) {
    connectionTokens.delete(token);
    return res.status(401).json({ success: false, error: 'Connection token expired' });
  }

  // Token is valid, consume it (One-time use)
  connectionTokens.delete(token);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  // Send initial connected event
  res.write(`event: connected\ndata: {"status": "connected", "userId": "${sessionData.userId}"}\n\n`);

  // Heartbeat to keep connection alive through proxies
  const heartbeatInterval = setInterval(() => {
    res.write(':\n\n'); // Empty comment is a standard SSE heartbeat
  }, 15000);

  // Subscribe to Redis backplane if available
  const subClient = getRedisStatus() ? getSubClient() : null;
  
  // Create a bound listener so we can remove it on disconnect
  const redisListener = (pattern, channel, message) => {
    if (pattern !== 'domain:*') return;
    
    try {
      const payload = JSON.parse(message);
      
      // Scope Check
      if (payload.siteId && sessionData.siteId && payload.siteId.toString() !== sessionData.siteId.toString()) {
          return; // Drop event, user not in scope
      }

      const eventName = channel.replace('domain:', '');
      res.write(`event: ${eventName}\ndata: ${message}\n\n`);
    } catch (err) {
      logger.error('SSE', 'Failed to parse Redis message for SSE', err);
    }
  };
  
  if (subClient) {
    subClient.on('pmessage', redisListener);
    subClient.psubscribe('domain:*').catch(err => {
      logger.error('SSE', 'Failed to psubscribe', err);
    });
  }

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    if (subClient) {
      subClient.off('pmessage', redisListener);
    }
    res.end();
  });
});

module.exports = router;
