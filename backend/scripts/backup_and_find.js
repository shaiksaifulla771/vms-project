const mongoose = require('mongoose');

async function run() {
  try {
    const conn = await mongoose.connect('mongodb://127.0.0.1:27017/vms');
    const db = conn.connection.db;
    
    // 1. Create Backups
    const ts = Date.now();
    const backupDate = new Date(ts).toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const matBackup = `materials_backup_${backupDate}`;
    const venBackup = `vendors_backup_${backupDate}`;
    const mpnBackup = `mpns_backup_${backupDate}`;
    const bomBackup = `boms_backup_${backupDate}`;

    await db.collection('materials').aggregate([{ $match: {} }, { $out: matBackup }]).toArray();
    await db.collection('vendors').aggregate([{ $match: {} }, { $out: venBackup }]).toArray();
    await db.collection('mpns').aggregate([{ $match: {} }, { $out: mpnBackup }]).toArray();
    await db.collection('boms').aggregate([{ $match: {} }, { $out: bomBackup }]).toArray();

    console.log(`--- BACKUPS CREATED ---`);
    console.log(`Materials: ${matBackup}`);
    console.log(`Vendors: ${venBackup}`);
    console.log(`MPNs: ${mpnBackup}`);
    console.log(`BOMs: ${bomBackup}`);
    
    // 2. Identify Test Data
    const testPatterns = /^(M-TEST-|V-TEST-|MPN-TEST-|AUDIT-|MAT-CYC-|MAT-DUP-|MAT-BATCH-|MAT-PQ-)/i;
    const testNamePatterns = /Batch Output Assembly|Audit|Test/i;

    const testMaterials = await db.collection('materials').find({
      $or: [
        { code: { $regex: testPatterns } },
        { name: { $regex: testNamePatterns } }
      ]
    }).toArray();

    const testVendors = await db.collection('vendors').find({
      $or: [
        { email: { $regex: /test/i } },
        { name: { $regex: testNamePatterns } },
        { code: { $regex: testPatterns } }
      ]
    }).toArray();

    const testMpns = await db.collection('mpns').find({
      $or: [
        { mpn: { $regex: testPatterns } },
        { manufacturer: { $regex: testNamePatterns } }
      ]
    }).toArray();

    // BOMs are harder to identify by string, we can look for BOMs where productId or components point to test materials
    const testMaterialIds = testMaterials.map(m => m._id);
    const testBoms = await db.collection('boms').find({
      $or: [
        { productId: { $in: testMaterialIds } },
        { 'components.materialId': { $in: testMaterialIds } }
      ]
    }).toArray();

    console.log(`\n--- TEST DATA TO DELETE ---`);
    console.log(`Materials (${testMaterials.length}):`);
    testMaterials.forEach(m => console.log(`  - ${m.code} | ${m.name} | ${m.type}`));

    console.log(`Vendors (${testVendors.length}):`);
    testVendors.forEach(v => console.log(`  - ${v.email || 'No Email'} | ${v.name}`));

    console.log(`MPNs (${testMpns.length}):`);
    testMpns.forEach(m => console.log(`  - ${m.mpn} | ${m.manufacturer}`));

    console.log(`BOMs (${testBoms.length}):`);
    testBoms.forEach(b => console.log(`  - BOM for productId: ${b.productId}`));

    // 3. Identify Duplicates (Materials only)
    console.log(`\n--- DUPLICATES TO DELETE ---`);
    // Find all materials grouped by name OR code to find exact duplicates
    const allMaterials = await db.collection('materials').find({}).toArray();
    
    const codeMap = {};
    const nameMap = {};
    const duplicatesToDelete = [];
    
    // Sort by createdAt desc so we keep the newest/most recent ones, or keep oldest? 
    // We'll keep the OLDEST by default, or the one with the most populated fields.
    // Let's just group them and print them.
    for (const m of allMaterials) {
      if (testMaterials.some(tm => tm._id.toString() === m._id.toString())) continue; // Skip test data
      
      const code = m.code ? m.code.toUpperCase() : null;
      const name = m.name ? m.name.toLowerCase().trim() : null;
      
      if (code && codeMap[code]) {
        duplicatesToDelete.push({ keep: codeMap[code], delete: m, reason: 'Duplicate Code' });
      } else if (code) {
        codeMap[code] = m;
      }

      if (name && nameMap[name]) {
        // If they have same name but different code, it's technically a name duplicate
        duplicatesToDelete.push({ keep: nameMap[name], delete: m, reason: 'Duplicate Name' });
      } else if (name) {
        nameMap[name] = m;
      }
    }

    if (duplicatesToDelete.length === 0) {
      console.log('  No duplicates found.');
    } else {
      duplicatesToDelete.forEach(d => {
        console.log(`  - REASON: ${d.reason}`);
        console.log(`    KEEP:   ${d.keep.code} | ${d.keep.name}`);
        console.log(`    DELETE: ${d.delete.code} | ${d.delete.name}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
