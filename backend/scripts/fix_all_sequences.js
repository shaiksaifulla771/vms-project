const mongoose = require('mongoose');

async function run() {
  const dbs = ['vms', 'vms_ci_test', 'vms_ci_test_local'];
  for (const dbName of dbs) {
    console.log(`\n--- CLEANING SEQUENCES FOR ${dbName} ---`);
    try {
      const conn = await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`);
      const db = conn.connection.db;

      // Clean old sequence documents that don't match the new model
      await db.collection('sequences').deleteMany({ name: { $exists: true } });

      // Calculate max Material Code
      const mats = await db.collection('materials').find({ code: { $regex: /^M\d+$/i }, status: { $ne: 'Deleted' } }).toArray();
      const maxMatVal = mats.reduce((max, m) => {
        const val = parseInt(m.code.substring(1), 10);
        return val > max ? val : max;
      }, 0);

      if (maxMatVal > 0) {
        await db.collection('sequences').updateOne(
          { _id: 'materialCode' }, 
          { $set: { seq: maxMatVal } }, 
          { upsert: true }
        );
        console.log(`-> FIXED Sequence for materialCode to ${maxMatVal}`);
      }

      // Calculate max Vendor Code
      const vens = await db.collection('vendors').find({ vendorId: { $regex: /^V\d+$/i }, status: { $ne: 'Deleted' } }).toArray();
      const maxVenVal = vens.reduce((max, v) => {
        const val = parseInt(v.vendorId.substring(1), 10);
        return val > max ? val : max;
      }, 0);

      if (maxVenVal > 0) {
        await db.collection('sequences').updateOne(
          { _id: 'vendorCode' }, 
          { $set: { seq: maxVenVal } }, 
          { upsert: true }
        );
        console.log(`-> FIXED Sequence for vendorCode to ${maxVenVal}`);
      }
      
      await mongoose.disconnect();
    } catch (err) {
      console.error(err);
    }
  }
  process.exit(0);
}
run();
