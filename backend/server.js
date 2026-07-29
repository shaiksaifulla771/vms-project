const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Models for Seeding
const User = require('./models/User');
const Vendor = require('./models/Vendor');
const Material = require('./models/Material');
const BOM = require('./models/BOM');
const InventoryItem = require('./models/InventoryItem');
const InventoryTransaction = require('./models/InventoryTransaction');
const PurchaseOrder = require('./models/PurchaseOrder');
const ProductionOrder = require('./models/ProductionOrder');
const QualityRecord = require('./models/QualityRecord');

// Load environment variables
dotenv.config();

// Validate JWT secret & production guards at server boot time
const getJwtSecret = require('./config/jwt');
getJwtSecret();

function determineSubcategory(name, type, vendor) {
  const lowerName = (name || '').toLowerCase();
  const lowerVendor = (vendor || '').toLowerCase();
  
  if (type === 'Raw') {
    if (
      lowerName.includes('pumpkin') || 
      lowerName.includes('banana') || 
      lowerName.includes('apple') || 
      lowerName.includes('mango') || 
      lowerName.includes('strawberry') || 
      lowerName.includes('papaya') || 
      lowerName.includes('carrot') || 
      lowerName.includes('tomato') || 
      lowerName.includes('garlic') || 
      lowerName.includes('ginger') || 
      lowerName.includes('onion') || 
      lowerName.includes('spinach') || 
      lowerName.includes('fresh') ||
      lowerVendor.includes('vegetable') || 
      lowerVendor.includes('fruits') ||
      lowerVendor.includes('jain farm fresh') || 
      lowerVendor.includes('shimla hills')
    ) {
      return 'Fresh';
    }
    if (
      lowerName.includes('pouch') || 
      lowerName.includes('cap') || 
      lowerName.includes('box') || 
      lowerName.includes('roll') || 
      lowerName.includes('film') || 
      lowerName.includes('brand') || 
      lowerVendor.includes('retail') ||
      lowerVendor.includes('brand')
    ) {
      return 'Retail';
    }
    return 'Standardized';
  } else {
    if (lowerName.includes('melt') || lowerName.includes('yogurt')) {
      return 'Yogurt Melts';
    }
    if (
      lowerName.includes('porridge') || 
      lowerName.includes('oats') || 
      lowerName.includes('wheat') || 
      lowerName.includes('rice') || 
      lowerName.includes('millet') || 
      lowerName.includes('lentil') || 
      lowerName.includes('barley') || 
      lowerName.includes('ragi') ||
      lowerName.includes('khichdi')
    ) {
      return 'Porridge';
    }
    return 'Puree';
  }
}

// Connect to database and seed data
connectDB().then(async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      console.log('Production mode active — skipping automatic database seeding.');
      return;
    }

    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already seeded, skipping seed step.');
      return;
    }
    // 1. Seed Users (Wipes existing to avoid duplications)
    await User.deleteMany({});
    console.log('Seeding default system users...');
    
    await User.create({
      username: 'System Admin',
      email: 'admin@vms.com',
      password: 'admin123',
      role: 'Admin',
      isVerified: true
    });
    console.log('Seeded Admin: admin@vms.com / admin123');

    await User.create({
      username: 'Inventory Manager',
      email: 'inventory@vms.com',
      password: 'manager123',
      role: 'Inventory Manager',
      isVerified: true
    });
    console.log('Seeded Inventory Manager: inventory@vms.com / manager123');

    await User.create({
      username: 'Production Manager',
      email: 'production@vms.com',
      password: 'manager123',
      role: 'Production Manager',
      isVerified: true
    });
    console.log('Seeded Production Manager: production@vms.com / manager123');

    // Read the all_recipes.json file
    const fs = require('fs');
    const path = require('path');
    const recipePath = path.join(__dirname, 'config', 'all_recipes.json');
    
    if (!fs.existsSync(recipePath)) {
      throw new Error(`Recipe file not found at ${recipePath}. Run extract-all-recipes.py first!`);
    }

    const rawData = fs.readFileSync(recipePath, 'utf8');
    const parsedData = JSON.parse(rawData);

    // 1. Seed Vendors
    console.log(`Seeding ${parsedData.vendors.length} vendors from Excel...`);
    const seededVendors = {};
    for (let vendorName of parsedData.vendors) {
      const slug = vendorName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `contact@${slug || 'sourcing'}.com`;
      const dbVendor = await Vendor.create({
        name: `${vendorName} Representative`,
        company: vendorName,
        email: email,
        phone: '+91-98765-99999',
        address: `${vendorName} Depot Complex, Sourcing Sector`,
        category: 'Other',
        status: 'Active'
      });
      seededVendors[vendorName] = dbVendor._id;
    }

    // 2. Seed Raw Materials
    console.log('Seeding raw materials from Excel...');
    const seededRawMaterials = {};
    const initialTxs = [];

    const rawMaterialKeys = Object.keys(parsedData.raw_materials);
    for (let code of rawMaterialKeys) {
      const rmData = parsedData.raw_materials[code];
      const dbRm = await Material.create({
        name: rmData.name,
        code: code,
        unit: rmData.unit,
        type: 'Raw',
        subcategory: determineSubcategory(rmData.name, 'Raw', rmData.vendor),
        description: `Raw component item sourced from ${rmData.vendor}`
      });
      seededRawMaterials[code] = dbRm._id;

      // Seed generous stock for raw materials (2000 units)
      const balance = 2000;
      await InventoryItem.create({ materialId: dbRm._id, balance });
      initialTxs.push({
        materialId: dbRm._id,
        quantity: balance,
        type: 'adjustment',
        notes: `Initial stock seeding for raw component ${rmData.name}`
      });
    }

    // 3. Seed Finished Goods
    console.log('Seeding finished goods from Excel...');
    const seededFinishedGoods = {};
    for (let fg of parsedData.finished_goods) {
      const dbFg = await Material.create({
        name: fg.name,
        code: fg.code,
        unit: 'pcs',
        type: 'Finished',
        subcategory: determineSubcategory(fg.name, 'Finished', ''),
        description: `Assembled finished spouted food pouch for ${fg.name}`
      });
      seededFinishedGoods[fg.code] = dbFg._id;

      // Seed small initial finished goods inventory (150 pcs)
      const balance = 150;
      await InventoryItem.create({ materialId: dbFg._id, balance });
      initialTxs.push({
        materialId: dbFg._id,
        quantity: balance,
        type: 'adjustment',
        notes: `Initial stock seeding for finished good ${fg.name}`
      });
    }

    // Insert inventory transactions in batch
    await InventoryTransaction.insertMany(initialTxs);
    console.log('Inventory balances seeded.');

    // 4. Seed BOM Recipes
    console.log('Registering BOM recipes...');
    for (let fg of parsedData.finished_goods) {
      const productId = seededFinishedGoods[fg.code];
      const components = fg.components
        .map(c => {
          const materialId = seededRawMaterials[c.code];
          let scaledQty = c.quantity / 1000;
          return { materialId, quantity: scaledQty };
        })
        .filter(comp => comp.materialId && comp.quantity >= 0.000001);

      if (components.length > 0) {
        await BOM.create({
          productId,
          components
        });
      }
    }
    console.log('All BOM recipes successfully registered.');
  } catch (err) {
    console.error(`Database seeding failed: ${err.message}`);
  }
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
