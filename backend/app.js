const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// Validate JWT secret & production guards at server boot time
const getJwtSecret = require('./config/jwt');
getJwtSecret();

const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// 1. Dynamic proxy trust configuration (Phase 8 & Testing)
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'test') {
  app.set('trust proxy', 1);
}

// 2. Enable CORS with strict production domain filtering
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Request-Id', 'Idempotency-Key', 'idempotency-key'],
  exposedHeaders: ['X-Correlation-Id', 'Set-Cookie'],
  credentials: true
}));

// Security headers: Content Security Policy (CSP) disabled explicitly because the frontend SPA relies on dynamic asset loading and Tailwind inline utility classes.
app.use(helmet({ contentSecurityPolicy: false }));

// Healthcheck endpoints (Public, bypasses rate limiters and auth)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});



const cookieParser = require('cookie-parser');
const correlationMiddleware = require('./middleware/correlationMiddleware');

// Body parser (Must be BEFORE any routes or rate limiters that might inspect body)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());
app.use(correlationMiddleware);

// Import rate limiters and auth middleware
const { unauthenticatedIpLimiter, writeLimiter, readLimiter, vmsVisitorLimiter, vmsMcpLimiter, vmsEmailLimiter } = require('./middleware/rateLimiter');
const { protect } = require('./middleware/authMiddleware');

// 1. Unauthenticated IP protection (Global defense against volumetric attacks & invalid JWT spam)
// Skips 2xx/3xx successful requests, so valid corporate NAT traffic is never penalized.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    return next(); // Auth routes have their own specific limiters
  }
  return unauthenticatedIpLimiter(req, res, next);
});

// 2. Mount public/auth routes BEFORE global protection
app.use('/api/auth', require('./routes/authRoutes'));

// 3. Global Authentication Validation (Ensures req.user is verified cryptographically)
// Routes that don't need auth (e.g. /health and /api/auth/*) bypass this
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    return next(); // Auth routes manage their own authentication
  }
  protect(req, res, next);
});

// 4. Authenticated User-Aware Rate Limiting
// Since this runs AFTER protect, req.user is guaranteed to be cryptographically verified!
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    return next();
  }
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return writeLimiter(req, res, next);
  } else if (req.method === 'GET') {
    return readLimiter(req, res, next);
  }
  next();
});

// Sanitize data against NoSQL query operator injection ($ and .)
app.use(mongoSanitize());





// Import location enforcement middleware
const { enforceActiveLocation } = require('./middleware/locationEnforcement');

// Mount routers (already protected by the global /api middleware chain)
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sites', require('./routes/siteRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
app.use('/api/vendors', require('./routes/vendorRoutes'));
app.use('/api/vendor-masters', require('./routes/vendorMasterRoutes'));
app.use('/api/materials', require('./routes/materialRoutes'));
app.use('/api/mpns', require('./routes/mpnRoutes'));
app.use('/api/boms', require('./routes/bomRoutes'));
app.use('/api/inventory', enforceActiveLocation, require('./routes/inventoryRoutes'));
app.use('/api/mrp', require('./routes/mrpRoutes'));
app.use('/api/procurement', require('./routes/procurementRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/production', require('./routes/productionPlanRoutes'));
app.use('/api/productions', enforceActiveLocation, require('./routes/productionRoutes'));
app.use('/api/production-plans', require('./routes/productionPlanRoutes'));
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

// Register VMS Domain Event Handlers
const { registerVMSEventHandlers } = require('./events/handlers/vmsEventHandlers');
registerVMSEventHandlers();

// Root route
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Manufacturing ERP API running.' });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
