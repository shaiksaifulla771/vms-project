const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';

async function cleanupTestArtifacts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB for test artifact cleanup...");

    const db = mongoose.connection.db;
    const mpnColl = db.collection('mpns');

    // Find test records matching known test patterns
    const query = {
      $or: [
        { manufacturerPartNumber: { $regex: /^(SEAL-|MPN-PART-|DRAFT-|INV-|MIN-|NOSQL-)/i } },
        { mpnName: { $regex: /(Draft Resistor|NoSQL Test|Min Bounds Test|Long String Test|Shaft Seal|Bearing 6205-2RS1|Invalid Active)/i } },
        { manufacturerName: 'TEST MFG' }
      ]
    };

    const countBefore = await mpnColl.countDocuments(query);
    console.log(`Found ${countBefore} test-artifact MPN record(s) matching test patterns.`);

    const deleteRes = await mpnColl.deleteMany(query);
    console.log(`Hard-deleted ${deleteRes.deletedCount} test-artifact MPN record(s) from database.`);

    const remainingCount = await mpnColl.countDocuments({ status: { $ne: 'Deleted' } });
    console.log(`Remaining clean production MPN records: ${remainingCount}`);

    await mongoose.disconnect();
    console.log("Cleanup complete!");
    process.exit(0);
  } catch (err) {
    console.error("Cleanup error:", err);
    process.exit(1);
  }
}

cleanupTestArtifacts();
