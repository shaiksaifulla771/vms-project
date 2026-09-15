const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');

// Models
const User = require('./models/User');
const Vendor = require('./models/Vendor');
const Material = require('./models/Material');
const BOM = require('./models/BOM');
const Warehouse = require('./models/Warehouse');
const Site = require('./models/Site');
const InventoryItem = require('./models/InventoryItem');
const InventoryTransaction = require('./models/InventoryTransaction');
const PurchaseOrder = require('./models/PurchaseOrder');
const ProductionPlan = require('./models/ProductionPlan');
const ProductionOrder = require('./models/ProductionOrder');
const QualityRecord = require('./models/QualityRecord');

dotenv.config();

function determineSubcategory(name, type, vendor) {
  const lowerName = (name || '').toLowerCase();
  const lowerVendor = (vendor || '').toLowerCase();

  if (type === 'Raw Material') {
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

async function seedDatabase() {
  try {
    await connectDB();
    console.log('Clearing existing ERP collections for clean database seeding...');
    await Promise.all([
      User.deleteMany({}),
      Vendor.deleteMany({}),
      Material.deleteMany({}),
      BOM.deleteMany({}),
      Warehouse.deleteMany({}),
      Site.deleteMany({}),
      InventoryItem.deleteMany({}),
      InventoryTransaction.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      ProductionPlan.deleteMany({}),
      ProductionOrder.deleteMany({}),
      QualityRecord.deleteMany({})
    ]);

    // 1. Seed System Users
    console.log('Seeding default system users...');
    await User.create({
      username: 'System Admin',
      email: 'admin@vms.com',
      password: 'admin123',
      role: 'Admin',
      isVerified: true
    });
    await User.create({
      username: 'Inventory Manager',
      email: 'inventory@vms.com',
      password: 'manager123',
      role: 'Inventory Manager',
      isVerified: true
    });
    await User.create({
      username: 'Production Manager',
      email: 'production@vms.com',
      password: 'manager123',
      role: 'Production Manager',
      isVerified: true
    });

    // 2. Seed Sites & Warehouses
    console.log('Seeding Sites and Warehouses...');
    const dbSite = await Site.create({
      code: 'SITE-01',
      name: 'Bengaluru Main Facility',
      address: 'Plot 42, Electronics City Phase 1, Bengaluru, Karnataka 560100',
      status: 'Active'
    });

    const defaultWH = await Warehouse.create({
      code: 'WH-01',
      name: 'Main Production Warehouse',
      siteId: dbSite._id,
      type: 'General',
      location: 'Bengaluru Facility - Zone A',
      status: 'Active'
    });

    const rawWH = await Warehouse.create({
      code: 'WH-02',
      name: 'Raw Material Storage',
      siteId: dbSite._id,
      type: 'Raw',
      location: 'Bengaluru Facility - Zone B',
      status: 'Active'
    });

    const fgWH = await Warehouse.create({
      code: 'WH-03',
      name: 'Finished Goods Depot',
      siteId: dbSite._id,
      type: 'FG',
      location: 'Bengaluru Facility - Zone C',
      status: 'Active'
    });

    // 3. Read recipe JSON dataset
    const recipePath = path.join(__dirname, 'config', 'all_recipes.json');
    if (!fs.existsSync(recipePath)) {
      throw new Error(`Recipe file not found at ${recipePath}. Run extract-all-recipes.py first!`);
    }

    const rawData = fs.readFileSync(recipePath, 'utf8');
    const parsedData = JSON.parse(rawData);

    // 4. Seed Vendors
    console.log(`Seeding ${parsedData.vendors.length} vendors from Excel...`);
    for (let vendorName of parsedData.vendors) {
      const slug = vendorName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `contact@${slug || 'sourcing'}.com`;
      await Vendor.create({
        name: `${vendorName} Representative`,
        company: vendorName,
        email: email,
        phone: '+91-98765-99999',
        address: `${vendorName} Depot Complex, Sourcing Sector`,
        category: 'Other',
        status: 'Active'
      });
    }

    // 5. Seed Raw Materials & Initial Inventory Balances
    console.log('Seeding raw materials and physical inventory...');
    const seededRawMaterials = {};
    const initialTxs = [];

    const rawMaterialKeys = Object.keys(parsedData.raw_materials);
    for (let code of rawMaterialKeys) {
      const rmData = parsedData.raw_materials[code];
      const dbRm = await Material.create({
        name: rmData.name,
        code: code,
        unit: rmData.unit || 'KG',
        type: 'Raw Material',
        subcategory: determineSubcategory(rmData.name, 'Raw Material', rmData.vendor),
        description: `Raw component item sourced from ${rmData.vendor}`
      });
      seededRawMaterials[code] = dbRm._id;

      // Seed generous physical stock for raw materials (5,000 units on hand, 0 reserved)
      const onHand = 5000;
      await InventoryItem.create({
        materialId: dbRm._id,
        warehouseId: defaultWH._id,
        quantityOnHand: onHand,
        reservedBalance: 0,
        quantityAvailable: onHand,
        balance: onHand
      });

      initialTxs.push({
        materialId: dbRm._id,
        warehouseId: defaultWH._id,
        quantity: onHand,
        type: 'Opening',
        referenceId: 'INIT-STOCK',
        notes: `Initial physical stock seeding for raw component ${rmData.name}`
      });
    }

    // 6. Seed Finished Goods & Initial Finished Stock
    console.log('Seeding finished goods...');
    const seededFinishedGoods = {};
    for (let fg of parsedData.finished_goods) {
      const dbFg = await Material.create({
        name: fg.name,
        code: fg.code,
        unit: 'pcs',
        type: 'Finished',
        subcategory: determineSubcategory(fg.name, 'Finished', ''),
        description: `Assembled finished product pouch for ${fg.name}`
      });
      seededFinishedGoods[fg.code] = dbFg._id;

      // Seed initial finished goods inventory (500 pcs)
      const onHand = 500;
      await InventoryItem.create({
        materialId: dbFg._id,
        warehouseId: defaultWH._id,
        quantityOnHand: onHand,
        reservedBalance: 0,
        quantityAvailable: onHand,
        balance: onHand
      });

      initialTxs.push({
        materialId: dbFg._id,
        warehouseId: defaultWH._id,
        quantity: onHand,
        type: 'Opening',
        referenceId: 'INIT-FG-STOCK',
        notes: `Initial stock seeding for finished good ${fg.name}`
      });
    }

    // Batch insert inventory transactions
    await InventoryTransaction.insertMany(initialTxs);
    console.log('Physical inventory stock balances successfully seeded.');

    // 7. Seed BOM Recipes
    console.log('Registering BOM recipes...');
    const createdBoms = [];
    for (let fg of parsedData.finished_goods) {
      const productId = seededFinishedGoods[fg.code];
      const components = fg.components
        .map(c => {
          const materialId = seededRawMaterials[c.code];
          let scaledQty = c.quantity / 1000;
          return { materialId, qty: scaledQty, quantity: scaledQty, uom: 'KG' };
        })
        .filter(comp => comp.materialId && comp.qty >= 0.0001);

      if (components.length > 0) {
        const bomDoc = await BOM.create({
          productId,
          bomNumber: `BOM-${fg.code}`,
          batchSize: 100,
          batchUOM: 'kg',
          version: 1,
          components
        });
        createdBoms.push(bomDoc);
      }
    }
    console.log(`${createdBoms.length} BOM recipes registered.`);

    // 8. Seed Demo Production Plans (Status: Unscheduled / Pending)
    console.log('Seeding demo Production Plans...');
    const fgCodes = Object.keys(seededFinishedGoods);
    if (fgCodes.length >= 2 && createdBoms.length >= 2) {
      const plan1 = await ProductionPlan.create({
        planNumber: 'PLAN-1001',
        productId: seededFinishedGoods[fgCodes[0]],
        bomId: createdBoms[0]._id,
        warehouseId: defaultWH._id,
        quantity: 200,
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'Unscheduled',
        notes: 'Initial production demand commitment for market stock'
      });

      const plan2 = await ProductionPlan.create({
        planNumber: 'PLAN-1002',
        productId: seededFinishedGoods[fgCodes[1]],
        bomId: createdBoms[1]._id,
        warehouseId: defaultWH._id,
        quantity: 150,
        requiredDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        status: 'Unscheduled',
        notes: 'Export requirement batch order'
      });

      console.log(`Demo Production Plans seeded: ${plan1.planNumber}, ${plan2.planNumber}`);
    }

    console.log('🎉 ERP Database Seeding Completed Cleanly!');
    process.exit(0);
  } catch (err) {
    console.error(`Database seeding failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

seedDatabase();
