const rateLimit = require('express-rate-limit');

const defaultMessage = { success: false, error: 'Too many requests. Please try again later.' };

const isProd = process.env.NODE_ENV === 'production';

const createLimiter = (options) => {
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    message: defaultMessage
  });
};

// Known malicious / bot User-Agent signatures
const BLOCKED_BOT_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /gobuster/i,
  /dirbuster/i,
  /wpscan/i,
  /eval-at/i,
  /python-requests\/0/i,
];

// Bot Protection Middleware: Blocks known malicious scanners & empty user agents in production
exports.botProtection = (req, res, next) => {
  const ua = req.headers['user-agent'] || '';

  // Block empty user agents in production on state-modifying / auth routes
  if (isProd && !ua.trim() && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return res.status(403).json({ success: false, error: 'Access denied.' });
  }

  // Block malicious scanner user agents
  for (const pattern of BLOCKED_BOT_PATTERNS) {
    if (pattern.test(ua)) {
      console.warn(`[BOT PROTECTION] Blocked malicious scanner UA: "${ua}" from IP: ${req.ip}`);
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
  }

  next();
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
