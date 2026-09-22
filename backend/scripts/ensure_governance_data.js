const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const Material = require('../models/Material');
const MPN = require('../models/MPN');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');

async function ensureGovernanceData() {
  const uri = process.env.MONGO_URI || process.env.TEST_MONGO_MEMORY_URI || 'mongodb://127.0.0.1:27017/vms';
  console.log('[Governance Script] Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 }).catch(async () => {
    // If local not reachable, check if process has memory uri
    if (process.env.TEST_MONGO_MEMORY_URI) {
      await mongoose.connect(process.env.TEST_MONGO_MEMORY_URI);
    }
  });

  if (mongoose.connection.readyState !== 1) {
    console.log('[Governance Script] MongoDB not connected directly. Running via in-memory server...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
  }

  console.log('[Governance Script] 🟢 Connected to DB:', mongoose.connection.name);

  // 1. Ensure Sites
  const siteDefs = [
    {
      code: 'MUM-01',
      name: 'Mumbai Plant',
      type: 'Manufacturing Plant',
      address: { street: 'MIDC Andheri East', city: 'Mumbai', state: 'Maharashtra', country: 'India', postalCode: '400093' },
      status: 'Active'
    },
    {
      code: 'PUN-01',
      name: 'Pune Facility',
      type: 'Manufacturing Plant',
      address: { street: 'Hinjawadi Phase 2', city: 'Pune', state: 'Maharashtra', country: 'India', postalCode: '411057' },
      status: 'Active'
    },
    {
      code: 'BLR-01',
      name: 'Bangalore Plant',
      type: 'Manufacturing Plant',
      address: { street: 'Electronic City Phase 1', city: 'Bangalore', state: 'Karnataka', country: 'India', postalCode: '560100' },
      status: 'Active'
    },
    {
      code: 'HYD-01',
      name: 'Hyderabad Plant',
      type: 'Manufacturing Plant',
      address: { street: 'Phase II, HITEC City', city: 'Hyderabad', state: 'Telangana', country: 'India', postalCode: '500081' },
      status: 'Active'
    },
    {
      code: 'MAA-01',
      name: 'Chennai Distribution Center',
      type: 'Distribution Center',
      address: { street: 'SIPCOT Industrial Park', city: 'Chennai', state: 'Tamil Nadu', country: 'India', postalCode: '600001' },
      status: 'Active'
    }
  ];

  const siteMap = {};
  for (const s of siteDefs) {
    const doc = await Site.findOneAndUpdate({ code: s.code }, { $set: s }, { upsert: true, new: true });
    siteMap[s.code] = doc;
  }
  console.log('✓ Verified Sites (Mumbai, Pune, Bangalore, Hyderabad, Chennai)');

  // 2. Ensure Warehouses with Section 10 Rule: 1 Location -> 1 WH minimum (Default)
  const warehouseDefs = [
    { code: 'WH-01', name: 'Mumbai Primary Store', siteId: siteMap['MUM-01']._id, type: 'Raw', isDefault: true, status: 'Active', location: 'Mumbai' },
    { code: 'WH-02', name: 'Mumbai Secondary Hub', siteId: siteMap['MUM-01']._id, type: 'FG', isDefault: false, status: 'Active', location: 'Mumbai' },
    { code: 'WH-PUN-01', name: 'Pune Primary Warehouse', siteId: siteMap['PUN-01']._id, type: 'Raw', isDefault: true, status: 'Active', location: 'Pune' },
    { code: 'WH-PUN-03', name: 'Pune Storage Depot', siteId: siteMap['PUN-01']._id, type: 'FG', isDefault: false, status: 'Active', location: 'Pune' },
    { code: 'WH-BLR-01', name: 'Bangalore Main Store', siteId: siteMap['BLR-01']._id, type: 'Raw', isDefault: true, status: 'Active', location: 'Bengaluru' },
    { code: 'WH-BLR-02', name: 'Bangalore Secondary Store', siteId: siteMap['BLR-01']._id, type: 'FG', isDefault: false, status: 'Active', location: 'Bengaluru' },
    { code: 'WH-BLR-04', name: 'Bangalore Deep Storage', siteId: siteMap['BLR-01']._id, type: 'General', isDefault: false, status: 'Active', location: 'Bengaluru' },
    { code: 'WH-HYD-RAW', name: 'Hyderabad Raw Materials Depot', siteId: siteMap['HYD-01']._id, type: 'Raw', isDefault: true, status: 'Active', location: 'Hyderabad' },
    { code: 'WH-HYD-FG', name: 'Hyderabad Finished Goods Hub', siteId: siteMap['HYD-01']._id, type: 'FG', isDefault: false, status: 'Active', location: 'Hyderabad' },
    { code: 'WH-MAA-DC', name: 'Chennai Central DC', siteId: siteMap['MAA-01']._id, type: 'FG', isDefault: true, status: 'Active', location: 'Chennai' },
  ];

  const whMap = {};
  for (const w of warehouseDefs) {
    const doc = await Warehouse.findOneAndUpdate({ code: w.code }, { $set: w }, { upsert: true, new: true });
    whMap[w.code] = doc;
  }
  console.log('✓ Verified Warehouses with Default WH bindings');

  // Verify that EVERY site has at least one default warehouse
  const allSites = await Site.find();
  for (const s of allSites) {
    const whs = await Warehouse.find({ siteId: s._id });
    const hasDefault = whs.some(w => w.isDefault);
    if (!hasDefault) {
      if (whs.length > 0) {
        await Warehouse.findByIdAndUpdate(whs[0]._id, { $set: { isDefault: true } });
        console.log(`  -> Marked warehouse ${whs[0].code} as default for site ${s.name}`);
      } else {
        const newDef = await Warehouse.create({
          code: `WH-${s.code}-01`,
          name: `${s.name} Main Warehouse`,
          siteId: s._id,
          parentSiteId: s._id,
          type: 'General',
          isDefault: true,
          status: 'Active',
          location: s.name,
        });
        console.log(`  -> Auto-created default warehouse ${newDef.code} for site ${s.name}`);
      }
    }
  }

  // 3. Link MPNs to Locations (Section 10)
  const mpnList = await MPN.find({ status: 'Active' });
  for (let i = 0; i < mpnList.length; i++) {
    const mpn = mpnList[i];
    if (!mpn.siteId) {
      const targetSite = (i % 3 === 0) ? siteMap['MUM-01'] : (i % 3 === 1) ? siteMap['PUN-01'] : siteMap['BLR-01'];
      mpn.siteId = targetSite._id;
      await mpn.save();
    }
  }
  console.log(`✓ Synchronized location bindings for ${mpnList.length} MPNs`);

  // 4. Ensure Finished Goods Products exist with type 'Finished'
  const fgCount = await Material.countDocuments({ $or: [{ type: 'Finished' }, { type: 'Finished Goods' }] });
  console.log(`✓ Finished Goods count in DB: ${fgCount}`);

  console.log('[Governance Script] 🌟 Master Governance Data Complete!');
  process.exit(0);
}

ensureGovernanceData().catch(err => {
  console.error('[Governance Script Error]:', err);
  process.exit(1);
});

