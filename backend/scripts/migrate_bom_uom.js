const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_db';

async function migrateBomUOM() {
  try {
    console.log('Connecting to MongoDB at:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB successfully.');

    const BOM = require('../models/BOM');

    const boms = await BOM.find({}).populate('productId', 'unit');
    console.log(`Found ${boms.length} BOM records to inspect/sanitize.`);

    let updatedCount = 0;

    for (const bom of boms) {
      let rawSize = bom.batchSize;
      let rawUOM = bom.batchUOM;
      let needsSave = false;

      // If batchSize is a string or contains letters, extract number and unit
      if (typeof rawSize === 'string') {
        const match = rawSize.match(/^([0-9\.]+)\s*(.*)$/);
        if (match) {
          const num = parseFloat(match[1]);
          const unitStr = match[2]?.trim();
          if (!isNaN(num)) {
            bom.batchSize = num;
            needsSave = true;
          }
          if (unitStr && !rawUOM) {
            bom.batchUOM = unitStr;
            needsSave = true;
          }
        }
      }

      // If batchUOM is missing or blank, populate from productId.unit or default 'pcs'
      if (!bom.batchUOM || !bom.batchUOM.trim()) {
        const fallbackUnit = bom.productId?.unit || 'pcs';
        bom.batchUOM = fallbackUnit;
        needsSave = true;
      }

      if (needsSave) {
        await bom.save();
        updatedCount++;
        console.log(`Updated BOM [${bom.bomNumber || bom._id}]: Batch Size = ${bom.batchSize}, UOM = ${bom.batchUOM}`);
      }
    }

    console.log(`Migration complete. Sanitized ${updatedCount} BOM records.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed with error:', err);
    process.exit(1);
  }
}

migrateBomUOM();
