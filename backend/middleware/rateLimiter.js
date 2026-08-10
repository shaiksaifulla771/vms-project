const rateLimit = require('express-rate-limit');

const defaultMessage = { success: false, error: 'Too many requests. Please try again later.' };

// In development or local preview environments, bypass rate limiting so UI actions and autosaves never get blocked
const createBypassOrLimiter = (options) => {
  if (process.env.NODE_ENV !== 'production') {
    return (req, res, next) => next();
  }
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    message: defaultMessage
  });
};

exports.loginLimiter = createBypassOrLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000
});

exports.registerLimiter = createBypassOrLimiter({
  windowMs: 60 * 60 * 1000,
  max: 1000
});

exports.otpLimiter = createBypassOrLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000
});

exports.unauthenticatedIpLimiter = createBypassOrLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10000
});

exports.writeLimiter = createBypassOrLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10000
});

exports.readLimiter = createBypassOrLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50000
});
