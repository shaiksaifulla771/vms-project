const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables FIRST
dotenv.config();

// Validate JWT secret & production guards at server boot time (crashes if missing)
const getJwtSecret = require('./config/jwt');
getJwtSecret();

const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Trust proxy (nginx / load balancer)
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'test') {
  app.set('trust proxy', 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Force HTTPS redirect (production only)
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (
    process.env.FORCE_HTTPS === 'true' &&
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Security Headers via Helmet (hardened)
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet({
  // Content Security Policy: restrict asset origins
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for React inline styles
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // Additional headers
  crossOriginEmbedderPolicy: false, // Required for some browser APIs
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,         // X-Content-Type-Options: nosniff
  frameguard: { action: 'deny' }, // X-Frame-Options: DENY
  xssFilter: true,
  permittedCrossDomainPolicies: false,
}));

// Remove X-Powered-By even if helmet misses it
app.disable('x-powered-by');

// Custom security headers
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CORS with strict production domain filtering
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS Access Denied: Origin '${origin}' is not permitted.`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Request-Id', 'Idempotency-Key', 'idempotency-key', 'X-Site-Id', 'x-site-id', 'X-Warehouse-Id', 'x-warehouse-id'],
  exposedHeaders: ['X-Correlation-Id', 'X-Site-Id', 'X-Warehouse-Id'],
  credentials: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
// 5. Healthcheck endpoints (Public, bypasses all rate limiters and auth)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Body parser (keep small — DoS protection)
// ─────────────────────────────────────────────────────────────────────────────
const cookieParser = require('cookie-parser');
const compression = require('compression');
const correlationMiddleware = require('./middleware/correlationMiddleware');
const queryPerformanceLogger = require('./middleware/queryPerformanceLogger');

// Response Gzip Compression for High-Throughput Performance
app.use(compression());

// Performance Telemetry: Slow Query Logger (>200ms)
app.use(queryPerformanceLogger);

// Tight body size limits: 100kb for JSON (prevents memory DoS attacks)
app.use(express.json({ limit: '100kb' }));
// File uploads use multipart — urlencoded kept small too
app.use(express.urlencoded({ limit: '100kb', extended: false }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(correlationMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// 7. NoSQL Injection Protection (strips $ and . from request body/query/params)
// ─────────────────────────────────────────────────────────────────────────────
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`[SECURITY] NoSQL injection attempt blocked on key: ${key}. IP: ${req.ip}`);
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// 8. HTTP Parameter Pollution Protection
// ─────────────────────────────────────────────────────────────────────────────
app.use(hpp({
  whitelist: ['status', 'role', 'type', 'warehouseId', 'siteId'], // Allow arrays on these params
}));

// ─────────────────────────────────────────────────────────────────────────────
// 9. Global String Trimming (prevent leading/trailing whitespace attacks)
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const trimStrings = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        trimStrings(obj[key]);
      }
    }
    return obj;
  };
  if (req.body) trimStrings(req.body);
  if (req.query) trimStrings(req.query);
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Rate Limiting & Auth Middleware
// ─────────────────────────────────────────────────────────────────────────────
const { unauthenticatedIpLimiter, writeLimiter, readLimiter, vmsVisitorLimiter, vmsMcpLimiter, vmsEmailLimiter, botProtection } = require('./middleware/rateLimiter');
const { protect } = require('./middleware/authMiddleware');

// Global Bot Protection
app.use('/api', botProtection);

// Global unauthenticated IP rate limiter (volumetric attack defense)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next(); // Auth routes have their own specific limiters
  return unauthenticatedIpLimiter(req, res, next);
});

// Mount auth routes BEFORE global protect middleware
app.use('/api/auth', require('./routes/authRoutes'));

// Global Firebase ID Token authentication (all /api/* routes except /api/auth/*)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  protect(req, res, next);
});

// Authenticated user-aware rate limiting (after protect — req.user is verified)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return writeLimiter(req, res, next);
  } else if (req.method === 'GET') {
    return readLimiter(req, res, next);
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Location Enforcement & Protected Route Mounts
// ─────────────────────────────────────────────────────────────────────────────
const { enforceActiveLocation } = require('./middleware/locationEnforcement');

app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/access', require('./routes/accessControlRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sites', require('./routes/siteRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
app.use('/api/vendors', require('./routes/vendorRoutes'));
app.use('/api/vendor-masters', require('./routes/vendorMasterRoutes'));
app.use('/api/materials', require('./routes/materialRoutes'));
app.use('/api/mpns', require('./routes/mpnRoutes'));
app.use('/api/bom', require('./routes/bomRoutes'));
app.use('/api/boms', require('./routes/bomRoutes'));
app.use('/api/inventory', enforceActiveLocation, require('./routes/inventoryRoutes'));
app.use('/api/mrp', require('./routes/mrpRoutes'));
app.use('/api/procurement', require('./routes/procurementRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/production-plans', require('./routes/productionPlanRoutes'));
app.use('/api/production', require('./routes/productionPlanRoutes'));
app.use('/api/productions', enforceActiveLocation, require('./routes/productionRoutes'));
app.use('/api/quality', require('./routes/qualityRoutes'));
app.use('/api/qc', require('./routes/qcRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/approvals', require('./routes/approvalRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/warehouse-materials', require('./routes/warehouseMaterialRoutes'));
app.use('/api/transfers', enforceActiveLocation, require('./routes/stockTransferRoutes'));
app.use('/api/imports', require('./routes/imports'));
app.use('/api/visitors', vmsVisitorLimiter, require('./routes/visitorRoutes'));
app.use('/api/appointments', vmsVisitorLimiter, enforceActiveLocation, require('./routes/appointmentRoutes'));
app.use('/api/email', vmsEmailLimiter, require('./routes/emailRoutes'));
app.use('/api/workflows', require('./routes/workflowRoutes'));
app.use('/api/plugins', require('./routes/pluginRoutes'));
app.use('/api/mcp', vmsMcpLimiter, require('./routes/mcpRoutes'));
app.use('/api/contracts', require('./routes/contractRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/performance', require('./routes/performanceRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

// ─────────────────────────────────────────────────────────────────────────────
// 12. VMS & Planning Domain Event Handlers
// ─────────────────────────────────────────────────────────────────────────────
const { registerVMSEventHandlers } = require('./events/handlers/vmsEventHandlers');
const { registerPlanningEventHandlers } = require('./events/handlers/planningEventHandlers');
registerVMSEventHandlers();
registerPlanningEventHandlers();

// Root route (minimal — no system info)
app.get('/', (req, res) => {
  res.json({ success: true, message: 'API running.' });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
