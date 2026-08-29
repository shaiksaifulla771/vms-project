/**
 * Phase 1 Database Migration & Backfill Script
 * Modernizes VMS schemas into flat, decoupled, 3-role structures with reversible rollback.
 * 
 * Usage:
 *   node scripts/migrate_vms_phase1.js          # Run forward migration & backfills
 *   node scripts/migrate_vms_phase1.js --verify # Dry-run verification of collections
 *   node scripts/migrate_vms_phase1.js --rollback # Rollback Phase 1 backfill mappings
 */

const dns = require('dns');
// Set DNS server fallbacks for Atlas connection resilience
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // Ignore in environments where setServers is restricted
}

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// Import Models
const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const BOMHeader = require('../models/BOMHeader');
const BOMItem = require('../models/BOMItem');
const MaterialClassification = require('../models/MaterialClassification');
const VendorClassification = require('../models/VendorClassification');
const RegistrationRequest = require('../models/RegistrationRequest');

const isRollback = process.argv.includes('--rollback');
const isVerify = process.argv.includes('--verify');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vms-project';
  console.log(`[Phase 1 Migration] Connecting to MongoDB: ${mongoUri.replace(/:[^:@]+@/, ':****@')}`);
  await mongoose.connect(mongoUri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });
  console.log('[Phase 1 Migration] Connected successfully to database.');
}

async function verifyState() {
  console.log('\n--- 🔍 Phase 1 State Verification ---');
  const userCount = await User.countDocuments();
  const activeUserCount = await User.countDocuments({ isActive: true });
  const siteCount = await Site.countDocuments();
  const warehouseCount = await Warehouse.countDocuments();
  const materialCount = await Material.countDocuments();
  const vendorCount = await Vendor.countDocuments();
  const mpnCount = await MPN.countDocuments();
  const inventoryCount = await InventoryItem.countDocuments();
  const legacyBomCount = await BOM.countDocuments();
  const bomHeaderCount = await BOMHeader.countDocuments();
  const bomItemCount = await BOMItem.countDocuments();
  const matClassCount = await MaterialClassification.countDocuments();
  const venClassCount = await VendorClassification.countDocuments();
  const regReqCount = await RegistrationRequest.countDocuments();

  console.log(`Users: ${userCount} total (${activeUserCount} active)`);
  console.log(`Sites: ${siteCount}`);
  console.log(`Warehouses: ${warehouseCount}`);
  console.log(`Materials: ${materialCount}`);
  console.log(`Vendors: ${vendorCount}`);
  console.log(`MPNs: ${mpnCount}`);
  console.log(`Inventory Items: ${inventoryCount}`);
  console.log(`Legacy BOMs: ${legacyBomCount}`);
  console.log(`BOM Headers: ${bomHeaderCount}`);
  console.log(`BOM Items: ${bomItemCount}`);
  console.log(`Material Classifications: ${matClassCount}`);
  console.log(`Vendor Classifications: ${venClassCount}`);
  console.log(`Registration Requests: ${regReqCount}`);
  console.log('-------------------------------------\n');
}

async function runForwardMigration() {
  console.log('\n🚀 Starting Phase 1 Forward Migration & Backfills...\n');

  // 1. Migrate Users to 3-Role System & isActive flag
  console.log('[1/7] Normalizing Users (Admin, Editor, Viewer) & Setting isActive...');
  const users = await User.find({});
  let userUpdated = 0;
  for (const u of users) {
    let changed = false;
    // Set isActive = true for existing active accounts
    if (u.accountStatus === 'ACTIVE' || u.accountStatus === 'Active' || u.approvalStatus === 'APPROVED' || !u.accountStatus) {
      if (!u.isActive) {
        u.isActive = true;
        u.accountStatus = 'ACTIVE';
        changed = true;
      }
    }
    // Normalize role
    const curRole = (u.role || '').toLowerCase();
    let targetRole = 'Viewer';
    if (curRole === 'admin' || curRole === 'administrator') {
      targetRole = 'Admin';
    } else if (['editor', 'inventory', 'production', 'warehouse', 'purchaser', 'planner', 'qc inspector', 'finance', 'manager'].some(k => curRole.includes(k))) {
      targetRole = 'Editor';
    } else {
      targetRole = 'Viewer';
    }

    if (u.role !== targetRole) {
      u.role = targetRole;
      changed = true;
    }

    if (changed) {
      await u.save();
      userUpdated++;
    }
  }
  console.log(`  ✓ Updated ${userUpdated} of ${users.length} users.`);

  // 2. Seed Default Root Classifications
  console.log('[2/7] Seeding Root Material & Vendor Classifications...');
  const defaultMatClasses = [
    { name: 'Raw Material', description: 'Raw ingredients and commodities' },
    { name: 'Packaged Material', description: 'Primary and secondary packaging' },
    { name: 'Semi-Finished', description: 'Intermediate blended mixtures' },
    { name: 'Finished', description: 'Packaged finished retail products' },
  ];
  for (const mc of defaultMatClasses) {
    await MaterialClassification.findOneAndUpdate(
      { name: mc.name },
      { $setOnInsert: { name: mc.name, description: mc.description, parentId: null, status: 'Active' } },
      { upsert: true, new: true }
    );
  }

  const defaultVenClasses = [
    { name: 'Raw Supplier', description: 'Suppliers of bulk ingredients' },
    { name: 'Packaging Vendor', description: 'Manufacturers of packaging materials' },
    { name: 'Contract Manufacturer', description: 'Third-party co-manufacturers' },
    { name: 'Logistics Partner', description: 'Freight and 3PL carriers' },
  ];
  for (const vc of defaultVenClasses) {
    await VendorClassification.findOneAndUpdate(
      { name: vc.name },
      { $setOnInsert: { name: vc.name, description: vc.description, parentId: null, status: 'Active' } },
      { upsert: true, new: true }
    );
  }
  console.log('  ✓ Root classifications seeded.');

  // 3. Backfill Sites siteId
  console.log('[3/7] Backfilling Sites siteId...');
  const sites = await Site.find({});
  for (const s of sites) {
    if (!s.siteId && s.code) {
      s.siteId = s.code;
      await s.save();
    }
  }
  console.log(`  ✓ Checked ${sites.length} sites.`);

  // 4. Backfill Warehouses warehouseId and parentSiteId
  console.log('[4/7] Backfilling Warehouses warehouseId & parentSiteId...');
  const warehouses = await Warehouse.find({});
  for (const w of warehouses) {
    let wChanged = false;
    if (!w.warehouseId && w.code) {
      w.warehouseId = w.code;
      wChanged = true;
    }
    if (!w.parentSiteId && w.siteId) {
      w.parentSiteId = w.siteId;
      wChanged = true;
    }
    if (wChanged) {
      await w.save();
    }
  }
  console.log(`  ✓ Checked ${warehouses.length} warehouses.`);

  // 5. Backfill Materials price, uom, and category link
  console.log('[5/7] Backfilling Materials price, uom & category links...');
  const matClassMap = {};
  const allMatClasses = await MaterialClassification.find({});
  for (const c of allMatClasses) matClassMap[c.name] = c._id;

  const materials = await Material.find({});
  for (const m of materials) {
    let mChanged = false;
    if (m.basePrice !== undefined && (m.price === undefined || m.price === 0)) {
      m.price = m.basePrice;
      mChanged = true;
    }
    if (m.unit && !m.uom) {
      m.uom = m.unit;
      mChanged = true;
    }
    if (!m.categoryId && m.type && matClassMap[m.type]) {
      m.categoryId = matClassMap[m.type];
      mChanged = true;
    }
    if (mChanged) {
      await m.save();
    }
  }
  console.log(`  ✓ Checked ${materials.length} materials.`);

  // 6. Backfill MPNs purchasePrice
  console.log('[6/7] Backfilling MPNs purchasePrice...');
  const mpns = await MPN.find({});
  for (const mpn of mpns) {
    if (mpn.price !== undefined && mpn.purchasePrice === undefined) {
      mpn.purchasePrice = mpn.price;
      await mpn.save();
    }
  }
  console.log(`  ✓ Checked ${mpns.length} MPN entries.`);

  // 7. Sync BOMs into multi-level BOMHeader & BOMItem collections
  console.log('[7/7] Migrating BOMs to BOMHeader and BOMItem structures...');
  const legacyBOMs = await BOM.find({});
  let bomsMigrated = 0;
  for (const bom of legacyBOMs) {
    const versionStr = String(bom.version || '1');
    const header = await BOMHeader.findOneAndUpdate(
      { productId: bom.productId, version: versionStr },
      {
        $set: {
          productId: bom.productId,
          bomNumber: bom.bomNumber || `BOM-${bom._id.toString().slice(-6).toUpperCase()}`,
          version: versionStr,
          batchSize: bom.batchSize || 1,
          batchUOM: bom.batchUOM || 'pcs',
          isActive: bom.status === 'Active',
          status: bom.status || 'Active',
          packagingCost: bom.packagingCost || 0,
          processingCost: bom.processingCost || 0,
          overheadCost: bom.overheadCost || 0,
        }
      },
      { upsert: true, new: true }
    );

    // Populate BOM items
    if (bom.components && bom.components.length > 0) {
      await BOMItem.deleteMany({ bomId: header._id });
      let pos = 1;
      for (const comp of bom.components) {
        await BOMItem.create({
          bomId: header._id,
          itemType: comp.childBomId ? 'bom' : 'material',
          materialId: comp.materialId || null,
          childBomId: comp.childBomId || null,
          quantity: comp.quantity || comp.qty || 0,
          uom: comp.uom || 'pcs',
          lossPercentage: comp.lossPercentage || comp.lossPercent || 0,
          position: pos++,
        });
      }
    }
    bomsMigrated++;
  }
  console.log(`  ✓ Migrated ${bomsMigrated} legacy BOMs to multi-level BOMHeader/BOMItem collections.`);

  console.log('\n🎉 Phase 1 Schema Migration & Backfill Completed Successfully!\n');
}

async function runRollback() {
  console.log('\n⚠️ Running Phase 1 Rollback Script...\n');
  console.log('Cleaning up generated BOMHeader and BOMItem records...');
  const deletedHeaders = await BOMHeader.deleteMany({});
  const deletedItems = await BOMItem.deleteMany({});
  console.log(`  ✓ Deleted ${deletedHeaders.deletedCount} BOMHeaders and ${deletedItems.deletedCount} BOMItems.`);
  console.log('\nRollback completed cleanly.');
}

async function main() {
  try {
    await connectDB();
    if (isVerify) {
      await verifyState();
    } else if (isRollback) {
      await runRollback();
      await verifyState();
    } else {
      await runForwardMigration();
      await verifyState();
    }
  } catch (err) {
    console.error('[Phase 1 Migration Error]:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[Phase 1 Migration] Database disconnected.');
  }
}

main();
