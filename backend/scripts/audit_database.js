const mongoose = require('mongoose');

async function auditDatabase() {
  try {
    const conn = await mongoose.connect('mongodb://127.0.0.1:55014/test');
    console.log('MongoDB Audit Connection Active (DB: ' + conn.connection.name + ')');

    const collections = await conn.connection.db.listCollections().toArray();
    console.log('\n=================== PROFESSIONAL DATABASE AUDIT ===================');
    console.log('Total Collections Found:', collections.length);
    console.log('-------------------------------------------------------------------');

    const results = [];
    for (const col of collections) {
      const count = await conn.connection.db.collection(col.name).countDocuments();
      const sample = await conn.connection.db.collection(col.name).findOne({});
      results.push({
        name: col.name,
        count,
        sampleKeys: sample ? Object.keys(sample).filter(k => k !== '__v').join(', ') : 'EMPTY'
      });
    }

    results.sort((a, b) => b.count - a.count);

    for (const r of results) {
      console.log(`[Collection] ${r.name.padEnd(28)} | Count: ${r.count.toString().padStart(5)} | Fields: ${r.sampleKeys.substring(0, 70)}...`);
    }

    console.log('===================================================================\n');

    // Specific Integrity Checks:
    const Material = conn.model('Material', new mongoose.Schema({}, { strict: false }));
    const Vendor = conn.model('Vendor', new mongoose.Schema({}, { strict: false }));
    const BOM = conn.model('BOM', new mongoose.Schema({}, { strict: false }));
    const MPN = conn.model('MPN', new mongoose.Schema({}, { strict: false }));
    const Warehouse = conn.model('Warehouse', new mongoose.Schema({}, { strict: false }));
    const InventoryItem = conn.model('InventoryItem', new mongoose.Schema({}, { strict: false }));

    const rawMatCount = await Material.countDocuments({ type: 'Raw Material' });
    const finProdCount = await Material.countDocuments({ type: 'Finished' });
    const pkgMatCount = await Material.countDocuments({ type: 'Packaged Material' });
    const semiFinCount = await Material.countDocuments({ type: 'Semi-Finished' });
    const deletedCount = await Material.countDocuments({ status: 'Deleted' });
    const activeCount = await Material.countDocuments({ status: { $ne: 'Deleted' } });

    console.log('--- Material Master Deep Breakdown ---');
    console.log(`- Active Materials:        ${activeCount}`);
    console.log(`- Deleted Materials:       ${deletedCount}`);
    console.log(`- Raw Materials:           ${rawMatCount}`);
    console.log(`- Finished Goods:          ${finProdCount}`);
    console.log(`- Packaged Materials:      ${pkgMatCount}`);
    console.log(`- Semi-Finished Materials: ${semiFinCount}`);
    console.log(`- Total Material Records:  ${await Material.countDocuments()}`);

    const activeVendors = await Vendor.countDocuments({ status: 'Active' });
    const totalVendors = await Vendor.countDocuments({});
    console.log(`\n--- Vendor Master Deep Breakdown ---`);
    console.log(`- Active Vendors:          ${activeVendors}`);
    console.log(`- Total Vendors:           ${totalVendors}`);

    const totalBoms = await BOM.countDocuments({});
    const activeBoms = await BOM.countDocuments({ status: 'Active' });
    console.log(`\n--- BOM Master Deep Breakdown ---`);
    console.log(`- Active BOMs:             ${activeBoms}`);
    console.log(`- Total BOMs:              ${totalBoms}`);

    const totalMPNs = await MPN.countDocuments({});
    console.log(`\n--- MPN Master Deep Breakdown ---`);
    console.log(`- Total MPN Records:       ${totalMPNs}`);

    const totalWarehouses = await Warehouse.countDocuments({});
    console.log(`\n--- Warehouses & Sites Breakdown ---`);
    console.log(`- Total Warehouses:        ${totalWarehouses}`);

    const totalStockItems = await InventoryItem.countDocuments({});
    console.log(`\n--- Inventory Ledger Deep Breakdown ---`);
    console.log(`- Total Stock Balance Rows: ${totalStockItems}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Audit Fatal Error:', err);
    process.exit(1);
  }
}

auditDatabase();
