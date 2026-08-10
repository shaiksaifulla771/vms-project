const rateLimit = require('express-rate-limit');

const defaultMessage = { success: false, error: 'Too many requests. Please try again later.' };

// Rate limiting is always active but with higher thresholds in development
const isProd = process.env.NODE_ENV === 'production';

const createLimiter = (options) => {
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    message: defaultMessage
  });
};

// Auth-specific limiters (tight in production, generous in dev)
exports.loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 200
});

exports.registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 5 : 100
});

exports.otpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 5 : 100
});

// General protection limiters
exports.unauthenticatedIpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 100 : 2000
});

exports.writeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 200 : 5000
});

exports.readLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 1000 : 10000
});

// VMS-specific rate limiters
exports.vmsVisitorLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 50 : 500
});

exports.vmsMcpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 300
});

exports.vmsEmailLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200
});
