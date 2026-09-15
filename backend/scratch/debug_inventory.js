const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const StockAdjustment = require('../models/StockAdjustment');
const StockTransfer = require('../models/StockTransfer');
const InventoryTransaction = require('../models/InventoryTransaction');

async function inspect() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/vms');
    console.log('\n=== INVENTORY SYSTEM AUDIT ===\n');

    const sites = await Site.find();
    console.log(`1. Sites (${sites.length}):`);
    sites.forEach(s => console.log(`   - ${s.name} (${s.code}) [ID: ${s._id}] - Status: ${s.status}`));

    const warehouses = await Warehouse.find().populate('siteId');
    console.log(`\n2. Warehouses (${warehouses.length}):`);
    warehouses.forEach(w => console.log(`   - ${w.name} (${w.code}) [ID: ${w._id}] - Site: ${w.siteId?.name || 'NONE'} - Status: ${w.status}`));

    const materials = await Material.find();
    console.log(`\n3. Materials count: ${materials.length}`);

    const items = await InventoryItem.find().populate('materialId').populate('warehouseId').populate('siteId');
    console.log(`\n4. InventoryItems count: ${items.length}`);
    const withWarehouse = items.filter(i => i.warehouseId);
    const withMaterial = items.filter(i => i.materialId);
    const withSite = items.filter(i => i.siteId);
    console.log(`   - Valid Warehouse Ref: ${withWarehouse.length}/${items.length}`);
    console.log(`   - Valid Material Ref: ${withMaterial.length}/${items.length}`);
    console.log(`   - Valid Site Ref: ${withSite.length}/${items.length}`);

    const positiveStock = items.filter(i => (i.balance > 0 || i.onHand > 0 || i.available > 0));
    console.log(`\n5. Items with Positive Balance (${positiveStock.length}):`);
    positiveStock.forEach(i => {
      console.log(`   * Material: ${i.materialId?.name || i.materialId} (${i.materialId?.code}) | WH: ${i.warehouseId?.name || i.warehouseId} | OnHand: ${i.onHand || i.balance} | Avail: ${i.available} | Res: ${i.reservedBalance || i.reserved}`);
    });

    const adjustments = await StockAdjustment.find().populate('materialId').populate('warehouseId');
    console.log(`\n6. Stock Adjustments (${adjustments.length}):`);
    adjustments.slice(0, 5).forEach(a => {
      console.log(`   * ${a.adjNumber}: ${a.adjustmentType} ${a.quantity} for ${a.materialId?.name} at ${a.warehouseId?.name} [Status: ${a.status}]`);
    });

    const transfers = await StockTransfer.find().populate('materialId').populate('fromWarehouseId').populate('toWarehouseId');
    console.log(`\n7. Stock Transfers (${transfers.length}):`);
    transfers.slice(0, 5).forEach(t => {
      console.log(`   * ${t.transferNumber}: ${t.quantity} of ${t.materialId?.name} from ${t.fromWarehouseId?.name} to ${t.toWarehouseId?.name} [Status: ${t.status}]`);
    });

    const txns = await InventoryTransaction.find().populate('materialId').populate('warehouseId');
    console.log(`\n8. Inventory Transactions / Ledger entries: ${txns.length}`);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Inspection error:', err);
  }
}

inspect();
