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

    // Wipe existing data to force clean seeding of the Excel dataset
    // console.log('Clearing existing ERP collections for fresh Excel seeding...');
    // await Promise.all([
    //   Vendor.deleteMany({}),
    //   Material.deleteMany({}),
    //   BOM.deleteMany({}),
    //   InventoryItem.deleteMany({}),
    //   InventoryTransaction.deleteMany({}),
    //   PurchaseOrder.deleteMany({}),
    //   ProductionOrder.deleteMany({}),
    //   QualityRecord.deleteMany({})
    // ]);

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

const app = express();

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true); // Dynamically reflect request origin in headers to allow network connections
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Mount routers
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vendors', require('./routes/vendorRoutes'));
app.use('/api/materials', require('./routes/materialRoutes'));
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

// Handle unhandled rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
  server.close(() => process.exit(1));
});
