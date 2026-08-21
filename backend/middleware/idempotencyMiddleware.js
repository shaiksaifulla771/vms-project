const IdempotencyKey = require('../models/IdempotencyKey');

/**
 * Idempotency Middleware — Enforces request deduplication and replay protection.
 * Replays cached response bodies for matching Idempotency-Key headers.
 */
const idempotencyMiddleware = async (req, res, next) => {
  const key = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (!key || !['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  req.idempotencyKey = key.trim();

  try {
    const existing = await IdempotencyKey.findOne({ key: req.idempotencyKey });
    if (existing && existing.response) {
      return res.status(existing.statusCode || 200).json(existing.response);
    }
  } catch (err) {
    console.warn('[Idempotency] Lookup warning:', err.message);
  }

  // Intercept response to record on success
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      IdempotencyKey.create({
        key: req.idempotencyKey,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        response: body,
      }).catch(err => {
        // Ignore duplicate key collision on simultaneous race
        if (err.code !== 11000) {
          console.warn('[Idempotency] Record creation warning:', err.message);
        }
      });
    }
    return originalJson.call(this, body);
  };

  next();
};

module.exports = idempotencyMiddleware;
