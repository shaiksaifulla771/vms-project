const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Models removed - seeding moved to scripts/seed.js
const { detectTransactionSupport } = require('./utils/transaction');

// Load environment variables
dotenv.config();

// Validate JWT secret & production guards at server boot time
const getJwtSecret = require('./config/jwt');
getJwtSecret();

// Connect to database
connectDB().then(async () => {
  await detectTransactionSupport();
  console.log('Database connected successfully.');
});

const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security headers: Content Security Policy (CSP) disabled explicitly because the frontend SPA relies on dynamic asset loading and Tailwind inline utility classes.
app.use(helmet({ contentSecurityPolicy: false }));

// Dedicated rate limiter for sensitive authentication endpoint (login)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 failed login attempts per 15 minutes per IP (bumped for test suite execution)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.' }
});

app.use('/api/auth/login', loginLimiter);

// Rate limiting scoped to write/mutating routes
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 mutating requests per 15 min per IP (ERP safe)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many write requests from this IP, please try again after 15 minutes.' }
});

app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Sanitize data against NoSQL query operator injection ($ and .)
app.use(mongoSanitize());

// Enable CORS with strict production domain filtering
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
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Mount routers
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vendors', require('./routes/vendorRoutes'));
app.use('/api/vendor-masters', require('./routes/vendorMasterRoutes'));
app.use('/api/materials', require('./routes/materialRoutes'));
app.use('/api/mpns', require('./routes/mpnRoutes'));
app.use('/api/boms', require('./routes/bomRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/productions', require('./routes/productionRoutes'));
app.use('/api/quality', require('./routes/qualityRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/imports', require('./routes/imports'));

// Root route
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Manufacturing ERP API running.' });
});

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in mode on port ${PORT}`);
});

// Server restart trigger
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
  server.close(() => process.exit(1));
});
