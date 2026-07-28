const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';

async function cleanupAllTestData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB for full test data cleanup...");

    const db = mongoose.connection.db;

    // 1. Material Master Cleanup
    const matColl = db.collection('materials');
    const matQuery = {
      $or: [
        { code: 'TEST9999' },
        { name: { $regex: /Test Soft Delete Material/i } },
        { description: { $regex: /Automated production test batch item/i } },
        { name: { $regex: /^Production Sourced C/i } }
      ]
    };
    const matCountBefore = await matColl.countDocuments(matQuery);
    const matDeleteRes = await matColl.deleteMany(matQuery);
    console.log(`[Material Master] Hard-deleted ${matDeleteRes.deletedCount} test-generated record(s) out of ${matCountBefore} found.`);

    // 2. MPN Master Cleanup
    const mpnColl = db.collection('mpns');
    const mpnQuery = {
      $or: [
        { manufacturerPartNumber: { $regex: /^(SEAL-|MPN-PART-|DRAFT-|INV-|MIN-|NOSQL-)/i } },
        { mpnName: { $regex: /(Draft Resistor|NoSQL Test|Min Bounds Test|Long String Test|Shaft Seal|Bearing 6205-2RS1|Invalid Active)/i } },
        { manufacturerName: 'TEST MFG' }
      ]
    };
    const mpnCountBefore = await mpnColl.countDocuments(mpnQuery);
    const mpnDeleteRes = await mpnColl.deleteMany(mpnQuery);
    console.log(`[MPN Master] Hard-deleted ${mpnDeleteRes.deletedCount} test-generated record(s) out of ${mpnCountBefore} found.`);

    // 3. Count remaining clean records
    const cleanMatCount = await matColl.countDocuments({ status: { $ne: 'Deleted' } });
    const cleanMpnCount = await mpnColl.countDocuments({ status: { $ne: 'Deleted' } });
    console.log(`\nRemaining Clean Active Records -> Materials: ${cleanMatCount}, MPNs: ${cleanMpnCount}`);

    await mongoose.disconnect();
    console.log("Full Cleanup Complete!");
    process.exit(0);
  } catch (err) {
    console.error("Cleanup error:", err);
    process.exit(1);
  }
}

cleanupAllTestData();
