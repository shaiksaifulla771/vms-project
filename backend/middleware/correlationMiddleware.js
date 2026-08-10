const crypto = require('crypto');

/**
 * Correlation Middleware — Attaches or generates a unique correlationId (UUID v4) to trace requests across services.
 * Propagates correlationId to req.correlationId and sets response header X-Correlation-Id.
 */
const correlationMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
};

module.exports = correlationMiddleware;
