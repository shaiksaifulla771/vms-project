const { connection: redis } = require('../config/queue');

/**
 * Idempotency Middleware — Enforces request deduplication across distributed instances using Redis.
 * Caches HTTP response bodies for matching Idempotency-Key headers with a 5-minute TTL.
 */
const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || !['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  req.idempotencyKey = idempotencyKey;
  const redisKey = `idempotency:${idempotencyKey}`;

  try {
    const cachedResponse = await redis.get(redisKey);
    if (cachedResponse) {
      const parsed = JSON.parse(cachedResponse);
      return res.status(parsed.status).json(parsed.body);
    }
  } catch (err) {
    console.warn('Idempotency Redis read failed, proceeding without cache:', err.message);
  }

  // Intercept response methods to cache result on success
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const payload = JSON.stringify({ status: res.statusCode, body });
        redis.setex(redisKey, 300, payload).catch(e => {
          console.warn('Idempotency Redis setex failed:', e.message);
        });
      } catch (e) {
        console.warn('Idempotency payload serialization failed:', e.message);
      }
    }
    return originalJson.call(this, body);
  };

  next();
};

module.exports = idempotencyMiddleware;
