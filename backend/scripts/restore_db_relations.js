const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';

async function restoreDbRelations() {
  try {
    console.log('Connecting to MongoDB...', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const Vendor = require('../models/Vendor');
    const Material = require('../models/Material');
    const MPN = require('../models/MPN');
    const BOM = require('../models/BOM');

    const vendors = await Vendor.find({});
    if (vendors.length === 0) throw new Error('No vendors found. Seed script failed?');
    const defaultVendor = vendors[0];

    const rawMaterials = await Material.find({ type: { $in: ['Raw', 'Raw Material', 'Packaged Material'] } });
    console.log(`Found ${rawMaterials.length} raw/packaged materials.`);

    // 1. Create MPNs for all Raw Materials
    let mpnCount = 0;
    for (const mat of rawMaterials) {
      const existingMpn = await MPN.findOne({ materialId: mat._id });
      if (!existingMpn) {
        await MPN.create({
          mpnCode: `MPN-AUTO-${mat.code}`,
          manufacturerPartNumber: `PN-${mat.code}`,
          mpnName: `Auto MPN for ${mat.name}`,
          manufacturerName: defaultVendor.name || 'Generic Mfg',
          materialId: mat._id,
          vendorId: defaultVendor._id,
          price: mat.basePrice > 0 ? mat.basePrice : Math.floor(Math.random() * 100) + 1,
          priceUOM: mat.unit,
          moq: 10,
          status: 'Active'
        });
        mpnCount++;
      }
    }
    console.log(`Created ${mpnCount} missing MPNs.`);

    // 2. Fix BOM Components
    // Because Mongoose strict mode might have stripped invalid properties, 
    // we query them directly from the raw MongoDB collection to get the old seeded fields.
    const rawBoms = await mongoose.connection.db.collection('boms').find({}).toArray();
    let bomUpdatedCount = 0;

    for (const rawBom of rawBoms) {
      let needsSave = false;
      const newComponents = [];

      for (const comp of (rawBom.components || [])) {
        // Did the seed script use materialId?
        if (comp.materialId) {
          const mpn = await MPN.findOne({ materialId: comp.materialId });
          if (mpn) {
            newComponents.push({
              mpnId: mpn._id,
              qty: comp.quantity || 1,
              lossPercent: 0
            });
            needsSave = true;
          }
        } else if (comp.mpnId) {
          newComponents.push(comp);
        }
      }

      let bUOM = rawBom.batchUOM;
      if (!bUOM) {
        const prod = await Material.findById(rawBom.productId);
        bUOM = prod ? prod.unit : 'pcs';
        needsSave = true;
      }
      
      let bSize = rawBom.batchSize;
      if (!bSize) {
          bSize = 100;
          needsSave = true;
      }

      if (needsSave && newComponents.length > 0) {
        await mongoose.connection.db.collection('boms').updateOne(
          { _id: rawBom._id },
          { $set: { components: newComponents, batchUOM: bUOM, batchSize: bSize } }
        );
        bomUpdatedCount++;
      }
    }
    console.log(`Updated ${bomUpdatedCount} BOMs with proper MPNs and fields.`);

    await mongoose.disconnect();
    console.log('Database relations restored!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

restoreDbRelations();
