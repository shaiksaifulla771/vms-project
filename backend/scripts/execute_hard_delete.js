const mongoose = require('mongoose');

async function run() {
  try {
    const conn = await mongoose.connect('mongodb://127.0.0.1:27017/vms');
    const db = conn.connection.db;

    console.log('--- EXECUTING HARD DELETE ---');

    // Identifiers
    const testPatterns = /^(M-TEST-|V-TEST-|MPN-TEST-|AUDIT-|MAT-CYC-|MAT-DUP-|MAT-BATCH-|MAT-PQ-)/i;
    const testNamePatterns = /Batch Output Assembly|Audit|Test/i;

    // 1. Delete test Materials
    const testMaterials = await db.collection('materials').find({
      $or: [
        { code: { $regex: testPatterns } },
        { name: { $regex: testNamePatterns } }
      ]
    }).toArray();
    const testMaterialIds = testMaterials.map(m => m._id);
    const delMatRes = await db.collection('materials').deleteMany({ _id: { $in: testMaterialIds } });
    console.log(`Deleted ${delMatRes.deletedCount} Test Materials.`);

    // 2. Delete test Vendors
    const testVendors = await db.collection('vendors').find({
      $or: [
        { email: { $regex: /test/i } },
        { name: { $regex: testNamePatterns } },
        { code: { $regex: testPatterns } }
      ]
    }).toArray();
    const testVendorIds = testVendors.map(v => v._id);
    const delVenRes = await db.collection('vendors').deleteMany({ _id: { $in: testVendorIds } });
    console.log(`Deleted ${delVenRes.deletedCount} Test Vendors.`);

    // 3. Delete test BOMs (that point to test materials)
    const delBomRes = await db.collection('boms').deleteMany({
      $or: [
        { productId: { $in: testMaterialIds } },
        { 'components.materialId': { $in: testMaterialIds } }
      ]
    });
    console.log(`Deleted ${delBomRes.deletedCount} Test BOMs.`);

    // 4. Delete Duplicate Materials (M1039 and M1042)
    const allMaterials = await db.collection('materials').find({}).toArray();
    const codeMap = {};
    const nameMap = {};
    const duplicatesToDelete = [];
    
    for (const m of allMaterials) {
      const code = m.code ? m.code.toUpperCase() : null;
      const name = m.name ? m.name.toLowerCase().trim() : null;
      
      if (code && codeMap[code]) {
        duplicatesToDelete.push(m._id);
      } else if (code) {
        codeMap[code] = m;
      }

      if (name && nameMap[name]) {
        duplicatesToDelete.push(m._id);
      } else if (name) {
        nameMap[name] = m;
      }
    }

    if (duplicatesToDelete.length > 0) {
      const delDupRes = await db.collection('materials').deleteMany({ _id: { $in: duplicatesToDelete } });
      console.log(`Deleted ${delDupRes.deletedCount} Duplicate Materials.`);
    }

    console.log('\n--- VERIFYING INTEGRITY ---');

    // Orphaned BOMs
    const boms = await db.collection('boms').find({}).toArray();
    let orphanedBoms = 0;
    for (const bom of boms) {
      const prodExists = await db.collection('materials').findOne({ _id: bom.productId });
      let compMissing = false;
      for (const comp of bom.components) {
        const compExists = await db.collection('materials').findOne({ _id: comp.materialId });
        if (!compExists) compMissing = true;
      }
      if (!prodExists || compMissing) orphanedBoms++;
    }
    console.log(`Orphaned BOMs Found: ${orphanedBoms}`);

    // Orphaned MPNs
    const mpns = await db.collection('mpns').find({}).toArray();
    let orphanedMpns = 0;
    for (const mpn of mpns) {
      const matExists = await db.collection('materials').findOne({ _id: mpn.materialId });
      const venExists = mpn.vendorId ? await db.collection('vendors').findOne({ _id: mpn.vendorId }) : true;
      if (!matExists || !venExists) orphanedMpns++;
    }
    console.log(`Orphaned MPNs Found: ${orphanedMpns}`);

    console.log('\n--- VERIFYING SEQUENCE COUNTERS ---');
    // Calculate actual max Material Code
    const mats = await db.collection('materials').find({ code: { $regex: /^M\d+$/i } }).toArray();
    const maxMatVal = mats.reduce((max, m) => {
      const val = parseInt(m.code.substring(1), 10);
      return val > max ? val : max;
    }, 0);

    const matSeq = await db.collection('sequences').findOne({ name: 'materialCode' });
    console.log(`Max Active Material Code: M${maxMatVal}`);
    console.log(`Current DB Sequence for materialCode: ${matSeq ? matSeq.seq : 'N/A'}`);
    
    if (matSeq && matSeq.seq !== maxMatVal) {
      await db.collection('sequences').updateOne({ name: 'materialCode' }, { $set: { seq: maxMatVal } });
      console.log(`-> FIXED Sequence for materialCode to ${maxMatVal}`);
    }

    // Calculate actual max Vendor Code
    const vens = await db.collection('vendors').find({ code: { $regex: /^V\d+$/i } }).toArray();
    const maxVenVal = vens.reduce((max, v) => {
      const val = parseInt(v.code.substring(1), 10);
      return val > max ? val : max;
    }, 0);

    const venSeq = await db.collection('sequences').findOne({ name: 'vendorCode' });
    console.log(`Max Active Vendor Code: V${maxVenVal}`);
    console.log(`Current DB Sequence for vendorCode: ${venSeq ? venSeq.seq : 'N/A'}`);
    
    if (venSeq && venSeq.seq !== maxVenVal) {
      await db.collection('sequences').updateOne({ name: 'vendorCode' }, { $set: { seq: maxVenVal } });
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
