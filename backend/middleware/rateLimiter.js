const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
const jwt = require('jsonwebtoken');
const { getClient, getRedisStatus } = require('../config/redis');

// Fallback memory store in case Redis is completely unreachable
// We use a separate memory store per limiter to maintain state
const MemoryStore = require('express-rate-limit').MemoryStore;

class ResilientStore {
  constructor(prefix) {
    this.memoryStore = new MemoryStore();
    if (process.env.NODE_ENV !== 'test') {
      this.redisStore = new RedisStore({
        sendCommand: (...args) => {
          const client = getClient();
          const command = args[0].toLowerCase();
          return client[command](...args.slice(1));
        },
        prefix: `vms:ratelimit:${prefix}:`
      });
    }
  }

  init(options) {
    if (typeof this.memoryStore.init === 'function') {
      this.memoryStore.init(options);
    }
    if (this.redisStore && typeof this.redisStore.init === 'function') {
      try {
        const promise = this.redisStore.init(options);
        if (promise && typeof promise.catch === 'function') {
          promise.catch(err => {
            console.warn(`[RateLimit] Redis init failed for ${options.windowMs}ms window (fallback to MemoryStore):`, err.message);
          });
        }
      } catch (err) {
        console.warn('[RateLimit] Redis init failed synchronously:', err.message);
      }
    }
  }

  async increment(key) {
    if (!this.redisStore || !this.redisStore || !getRedisStatus()) return this.memoryStore.increment(key);
    try {
      return await this.redisStore.increment(key);
    } catch (err) {
      console.error(`[RateLimit] Redis failover to memory for key ${key}`);
      return this.memoryStore.increment(key);
    }
  }

  async decrement(key) {
    if (!this.redisStore || !getRedisStatus()) return this.memoryStore.decrement(key);
    try {
      return await this.redisStore.decrement(key);
    } catch (err) {
      return this.memoryStore.decrement(key);
    }
  }

  async resetKey(key) {
    if (!this.redisStore || !getRedisStatus()) return this.memoryStore.resetKey(key);
    try {
      return await this.redisStore.resetKey(key);
    } catch (err) {
      return this.memoryStore.resetKey(key);
    }
  }
}

// We no longer decode JWTs here. Identity must come ONLY from verified authMiddleware.
const userKeyGenerator = (req, res) => {
  // If authenticated, limit by user. If somehow not authenticated, fallback to IP (should not happen if placed after auth middleware).
  if (req.user && req.user.id) return `user:${req.user.id}`;
  if (req.user && req.user._id) return `user:${req.user._id.toString()}`;
  return ipKeyGenerator(req, res);
};

const defaultMessage = { success: false, error: 'Too many requests. Please try again later.' };

// ---------------------------------------------------------
// AUTHENTICATION LIMITERS (Strict, separate stores)
// ---------------------------------------------------------

exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultMessage,
  skipSuccessfulRequests: true, // Only count failed logins
  store: new ResilientStore('login')
});

exports.registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultMessage,
  store: new ResilientStore('register')
});

exports.otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultMessage,
  store: new ResilientStore('otp')
});

// ---------------------------------------------------------
// UNAUTHENTICATED IP LIMITER (First line of defense)
// Runs BEFORE auth middleware. Skips if the request succeeds (or is authenticated)
// to prevent locking out entire corporate NATs.
// ---------------------------------------------------------

exports.unauthenticatedIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultMessage,
  store: new ResilientStore('unauthIp'),
  skipSuccessfulRequests: true // Only consume quota if the request results in 4xx/5xx (e.g. 401 Unauthorized)
});

// ---------------------------------------------------------
// GLOBAL API LIMITERS (ERP-safe, verified user-aware)
// Runs AFTER auth middleware.
// ---------------------------------------------------------

exports.writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultMessage,
  store: new ResilientStore('write'),
  keyGenerator: userKeyGenerator
});

exports.readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultMessage,
  store: new ResilientStore('read'),
  keyGenerator: userKeyGenerator
});
