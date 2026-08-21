const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const InventoryItem = require('../models/InventoryItem');
const PurchaseRequirement = require('../models/PurchaseRequirement');
const PurchaseOrder = require('../models/PurchaseOrder');
const InventoryTransaction = require('../models/InventoryTransaction');
const ProcurementAutomationService = require('../services/procurementAutomationService');

async function runProcurementVerification() {
  console.log('===============================================================');
  console.log('  ENTERPRISE PROCUREMENT & PRODUCT AUTOMATION TEST SUITE');
  console.log('===============================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/vms_db';
  await mongoose.connect(mongoUri);
  console.log(' connected to MongoDB.\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(` [PASS] ${message}`);
      passed++;
    } else {
      console.error(` [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // 1. Setup Test Site & Warehouse
    const testSite = await Site.findOneAndUpdate(
      { code: 'TEST-SITE-PROC' },
      { name: 'Procurement Test Site', code: 'TEST-SITE-PROC', status: 'Active' },
      { upsert: true, new: true }
    );

    const testWarehouse = await Warehouse.findOneAndUpdate(
      { code: 'TEST-WH-PROC' },
      { name: 'Procurement Test WH', code: 'TEST-WH-PROC', siteId: testSite._id, status: 'Active' },
      { upsert: true, new: true }
    );

    const testVendor = await Vendor.findOneAndUpdate(
      { name: 'Titan Industrial Supplies' },
      { name: 'Titan Industrial Supplies', company: 'Titan Corp', email: 'orders@titan.com', status: 'Active' },
      { upsert: true, new: true }
    );

    console.log('[1/5] Testing Material Master Planning Parameters...');
    const testMaterial = await Material.findOneAndUpdate(
      { code: 'MAT-PROC-TEST-01' },
      {
        name: 'Precision Ball Bearing 608ZZ',
        code: 'MAT-PROC-TEST-01',
        unit: 'pcs',
        type: 'Raw Material',
        basePrice: 45.5,
        safetyStock: 20,
        minOrderQty: 50,
        moq: 50,
        lotSize: 10,
        leadTimeDays: 5,
        makeOrBuy: 'BUY',
        defaultVendorId: testVendor._id,
        reorderPoint: 30,
        reorderQuantity: 80,
        status: 'Active',
      },
      { upsert: true, new: true }
    );

    assert(testMaterial.reorderPoint === 30, 'Material reorderPoint persisted correctly');
    assert(testMaterial.minOrderQty === 50, 'Material MOQ (minOrderQty) persisted correctly');
    assert(testMaterial.lotSize === 10, 'Material lotSize persisted correctly');
    assert(testMaterial.makeOrBuy === 'BUY', 'Material makeOrBuy persisted correctly');

    // 2. Setup initial low inventory to trigger reorder
    await InventoryItem.deleteMany({ materialId: testMaterial._id });
    await InventoryItem.create({
      materialId: testMaterial._id,
      warehouseId: testWarehouse._id,
      siteId: testSite._id,
      onHand: 15,
      reserved: 0,
      available: 15,
    });

    console.log('\n[2/5] Testing Automated Reorder Point Evaluation...');
    // Clear existing PRs for test material
    await PurchaseRequirement.deleteMany({ materialId: testMaterial._id });

    const reorderResult = await ProcurementAutomationService.evaluateReorderPoints({
      warehouseId: testWarehouse._id,
      siteId: testSite._id,
    });

    assert(reorderResult.requirementsCreated >= 1, `Reorder check created requirements (Count: ${reorderResult.requirementsCreated})`);

    const createdPR = await PurchaseRequirement.findOne({
      materialId: testMaterial._id,
      status: 'OPEN',
    });

    assert(createdPR !== null, 'Found created PurchaseRequirement for low stock material');
    assert(createdPR.quantity >= 50, `PR quantity (${createdPR.quantity}) respects MOQ of 50`);
    assert(createdPR.quantity % 10 === 0, `PR quantity (${createdPR.quantity}) respects Lot Size multiple of 10`);
    assert(createdPR.suggestedVendor.toString() === testVendor._id.toString(), 'PR automatically linked to default vendor');

    console.log('\n[3/5] Testing Bulk Conversion: Purchase Requirements -> Purchase Order...');
    const conversionResult = await ProcurementAutomationService.bulkConvertRequirementsToPO({
      requirementIds: [createdPR._id],
      destinationWarehouseId: testWarehouse._id,
      siteId: testSite._id,
    });

    assert(conversionResult.ordersCreatedCount === 1, 'Bulk conversion created 1 Purchase Order');
    assert(conversionResult.requirementsConvertedCount === 1, '1 Requirement was converted');

    const createdPO = await PurchaseOrder.findById(conversionResult.orders[0]._id);
    assert(createdPO !== null, 'PO document exists in database');
    assert(createdPO.status === 'Pending', 'Created PO has initial status Pending');
    assert(createdPO.destinationWarehouseId.toString() === testWarehouse._id.toString(), 'PO destination warehouse assigned correctly');
    assert(createdPO.materials.length === 1, 'PO has 1 line item');
    assert(createdPO.materials[0].quantity === createdPR.quantity, 'PO line item quantity matches PR quantity');

    const updatedPR = await PurchaseRequirement.findById(createdPR._id);
    assert(updatedPR.status === 'CONVERTED_TO_PO', 'PR transitioned to CONVERTED_TO_PO status');
    assert(updatedPR.convertedPurchaseOrderId.toString() === createdPO._id.toString(), 'PR linked to created PO ID');

    console.log('\n[4/5] Testing PO Authorization & Partial Goods Receipt (GRN)...');
    // Approve PO
    createdPO.status = 'Approved';
    await createdPO.save();

    const orderQty = createdPO.materials[0].quantity; // e.g. 70
    const partialReceiveQty = Math.floor(orderQty / 2); // e.g. 35

    const grn1 = await ProcurementAutomationService.recordGoodsReceipt({
      poId: createdPO._id,
      warehouseId: testWarehouse._id,
      siteId: testSite._id,
      items: [{
        materialId: testMaterial._id,
        receivedQuantity: partialReceiveQty,
        lotNumber: 'LOT-TEST-001',
        batchNumber: 'BAT-A',
        locationBin: 'BIN-101',
      }],
      notes: 'Partial shipment batch 1',
    });

    assert(grn1.status === 'Partially Received', `PO transitioned to 'Partially Received' (GRN: ${grn1.grnNumber})`);

    const invAfterGRN1 = await InventoryItem.findOne({
      materialId: testMaterial._id,
      warehouseId: testWarehouse._id,
    });

    assert(invAfterGRN1.onHand === 15 + partialReceiveQty, `Inventory increased by partial receipt quantity: ${invAfterGRN1.onHand}`);

    const tx1 = await InventoryTransaction.findOne({
      referenceId: createdPO._id.toString(),
      type: 'purchase',
    });
    assert(tx1 !== null, 'InventoryTransaction recorded for purchase receipt');
    assert(tx1.quantity === partialReceiveQty, `Transaction quantity matches partial GRN: ${tx1.quantity}`);

    console.log('\n[5/5] Testing Final GRN Receipt & Complete PO Closure...');
    const remainingQty = orderQty - partialReceiveQty;

    const grn2 = await ProcurementAutomationService.recordGoodsReceipt({
      poId: createdPO._id,
      warehouseId: testWarehouse._id,
      siteId: testSite._id,
      items: [{
        materialId: testMaterial._id,
        receivedQuantity: remainingQty,
        lotNumber: 'LOT-TEST-002',
        batchNumber: 'BAT-B',
        locationBin: 'BIN-102',
      }],
      notes: 'Final delivery batch 2',
    });

    assert(grn2.status === 'Received', `PO status transitioned to final 'Received' (GRN: ${grn2.grnNumber})`);

    const invAfterGRN2 = await InventoryItem.findOne({
      materialId: testMaterial._id,
      warehouseId: testWarehouse._id,
    });

    assert(invAfterGRN2.onHand === 15 + orderQty, `Final on-hand inventory matches total ordered + initial: ${invAfterGRN2.onHand}`);

    const reloadedPO = await PurchaseOrder.findById(createdPO._id);
    assert(reloadedPO.materials[0].lineStatus === 'RECEIVED', 'PO material line status is RECEIVED');
    assert(reloadedPO.materials[0].receivedQuantity === orderQty, 'PO line received quantity equals total ordered quantity');
    assert(reloadedPO.grnHistory.length === 2, 'PO recorded both GRN receipt history entries');

    console.log('\n===============================================================');
    console.log(`  ALL PROCUREMENT & AUTOMATION TESTS PASSED: ${passed} / ${total} (100%)`);
    console.log('===============================================================\n');

  } catch (error) {
    console.error('\n TEST RUN ENCOUNTERED FAILURE:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runProcurementVerification();
