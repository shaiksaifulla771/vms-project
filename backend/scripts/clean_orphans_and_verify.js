const mongoose = require('mongoose');

async function run() {
  try {
    const conn = await mongoose.connect('mongodb://127.0.0.1:27017/vms');
    const db = conn.connection.db;

    console.log('--- CLEANING ORPHANS ---');

    // Clean Orphaned BOMs
    const boms = await db.collection('boms').find({}).toArray();
    let orphanedBomIds = [];
    for (const bom of boms) {
      const prodExists = await db.collection('materials').findOne({ _id: bom.productId });
      let compMissing = false;
      for (const comp of bom.components) {
        const compExists = await db.collection('materials').findOne({ _id: comp.materialId });
        if (!compExists) compMissing = true;
      }
      if (!prodExists || compMissing) orphanedBomIds.push(bom._id);
    }
    if (orphanedBomIds.length > 0) {
      const delBoms = await db.collection('boms').deleteMany({ _id: { $in: orphanedBomIds } });
      console.log(`Deleted ${delBoms.deletedCount} Orphaned BOMs.`);
    }

    // Clean Orphaned MPNs
    const mpns = await db.collection('mpns').find({}).toArray();
    let orphanedMpnIds = [];
    for (const mpn of mpns) {
      const matExists = await db.collection('materials').findOne({ _id: mpn.materialId });
      const venExists = mpn.vendorId ? await db.collection('vendors').findOne({ _id: mpn.vendorId }) : true;
      if (!matExists || !venExists) orphanedMpnIds.push(mpn._id);
    }
    if (orphanedMpnIds.length > 0) {
      const delMpns = await db.collection('mpns').deleteMany({ _id: { $in: orphanedMpnIds } });
      console.log(`Deleted ${delMpns.deletedCount} Orphaned MPNs.`);
    }

    console.log('\n--- VERIFYING SEQUENCE COUNTERS ---');
    // Calculate actual max Material Code
    const mats = await db.collection('materials').find({ code: { $regex: /^M\d+$/i }, status: { $ne: 'Deleted' } }).toArray();
    const maxMatVal = mats.reduce((max, m) => {
      const val = parseInt(m.code.substring(1), 10);
      return val > max ? val : max;
    }, 0);

    const matSeq = await db.collection('sequences').findOne({ name: 'materialCode' });
    console.log(`Max Active Material Code: M${maxMatVal}`);
    console.log(`Current DB Sequence for materialCode: ${matSeq ? matSeq.seq : 'N/A'}`);
    
    if (!matSeq || matSeq.seq !== maxMatVal) {
      await db.collection('sequences').updateOne({ name: 'materialCode' }, { $set: { seq: maxMatVal } }, { upsert: true });
      console.log(`-> FIXED Sequence for materialCode to ${maxMatVal}`);
    }

    // Calculate actual max Vendor Code
    const vens = await db.collection('vendors').find({ vendorId: { $regex: /^V\d+$/i }, status: { $ne: 'Deleted' } }).toArray();
    const maxVenVal = vens.reduce((max, v) => {
      const val = parseInt(v.vendorId.substring(1), 10);
      return val > max ? val : max;
    }, 0);

    const venSeq = await db.collection('sequences').findOne({ name: 'vendorCode' });
    console.log(`Max Active Vendor Code: V${maxVenVal}`);
    console.log(`Current DB Sequence for vendorCode: ${venSeq ? venSeq.seq : 'N/A'}`);
    
    if (!venSeq || venSeq.seq !== maxVenVal) {
      await db.collection('sequences').updateOne({ name: 'vendorCode' }, { $set: { seq: maxVenVal } }, { upsert: true });
      console.log(`-> FIXED Sequence for vendorCode to ${maxVenVal}`);
    }

    // Final Counts
    const cMat = await db.collection('materials').countDocuments();
    const cVen = await db.collection('vendors').countDocuments();
    const cMpn = await db.collection('mpns').countDocuments();
    const cBom = await db.collection('boms').countDocuments();
    console.log('\n--- FINAL COUNTS ---');
    console.log(`Materials: ${cMat}`);
    console.log(`Vendors: ${cVen}`);
    console.log(`MPNs: ${cMpn}`);
    console.log(`BOMs: ${cBom}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
