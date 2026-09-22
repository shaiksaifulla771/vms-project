const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const BOM = require('../models/BOM');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const ProductionOrder = require('../models/ProductionOrder');
const User = require('../models/User');

async function runVerification() {
  console.log('===============================================================');
  console.log('       END-TO-END ENTERPRISE ARCHITECTURE VERIFICATION         ');
  console.log('===============================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_dev';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB:', mongoose.connection.name);

  const results = { passed: 0, failed: 0 };
  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      results.passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      results.failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: MASTER DATA SAFEGUARD INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- 1. MASTER DATA SAFEGUARD INTEGRITY ---');
    const materialCount = await Material.countDocuments({ status: { $ne: 'Deleted' } });
    const vendorCount = await Vendor.countDocuments({ status: { $ne: 'Deleted' } });
    const mpnCount = await MPN.countDocuments({ status: { $ne: 'Deleted' } });
    const bomCount = await BOM.countDocuments({ status: { $ne: 'Deleted' } });

    console.log(`  Current counts: Materials=${materialCount}, Vendors=${vendorCount}, MPNs=${mpnCount}, BOMs=${bomCount}`);
    assert(materialCount >= 108, `Materials preserved (Expected >= 108, Found: ${materialCount})`);
    assert(vendorCount >= 43, `Vendors preserved (Expected >= 43, Found: ${vendorCount})`);
    assert(mpnCount >= 86, `MPNs preserved (Expected >= 86, Found: ${mpnCount})`);
    assert(bomCount >= 22, `BOM Recipes preserved (Expected >= 22, Found: ${bomCount})`);

    // -------------------------------------------------------------
    // TEST 2: BOM SCHEMA & BATCH PARAMETERS
    // -------------------------------------------------------------
    console.log('\n--- 2. BOM BATCH PARAMETERS & LOCATION ASSIGNMENT ---');
    const sampleBom = await BOM.findOne({ status: 'Active' })
      .populate('components.materialId')
      .populate('productId');
    assert(sampleBom !== null, 'Found an active BOM recipe');
    assert(sampleBom.batchSize !== undefined && sampleBom.batchSize > 0, `BOM has batchSize: ${sampleBom.batchSize}`);
    assert(sampleBom.batchUOM !== undefined, `BOM has batchUOM: ${sampleBom.batchUOM}`);
    assert(sampleBom.expectedOutputQty !== undefined, `BOM has expectedOutputQty: ${sampleBom.expectedOutputQty}`);

    const site = await Site.findOne({ status: 'Active' });
    const warehouse = await Warehouse.findOne({ siteId: site._id, status: 'Active' }) || await Warehouse.findOne({ status: 'Active' });

    sampleBom.siteId = site._id;
    sampleBom.warehouseId = warehouse._id;
    await sampleBom.save();

    const reloadedBom = await BOM.findById(sampleBom._id);
    assert(reloadedBom.siteId && reloadedBom.siteId.toString() === site._id.toString(), 'BOM location (siteId) persists correctly');
    assert(reloadedBom.warehouseId && reloadedBom.warehouseId.toString() === warehouse._id.toString(), 'BOM target warehouse persists correctly');

    // -------------------------------------------------------------
    // TEST 3: CENTRALIZED INVENTORY INWARD & OUTWARD BY LOT
    // -------------------------------------------------------------
    console.log('\n--- 3. CENTRALIZED INVENTORY (INWARD & OUTWARD BY LOT) ---');
    const rawMaterial = await Material.findOne({ type: 'Raw Material' }) || await Material.findOne({});
    const testLot = `LOT-TEST-${Date.now().toString().slice(-6)}`;
    const inwardQty = 500;

    const InventoryLedgerService = require('../services/inventoryLedgerService');
    const adminUser = await User.findOne({ role: 'Admin' }) || await User.findOne({});

    await InventoryLedgerService.recordTransaction({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: inwardQty,
      type: 'INWARD_PURCHASE',
      batchNumber: testLot,
      lotNumber: testLot,
      mfgDate: new Date('2026-01-15'),
      expiryDate: new Date('2027-01-15'),
      sourceDocType: 'ManualInward',
      reason: 'Quality Certified PO Receipt',
      userId: adminUser._id
    });

    const inwardItem = await InventoryItem.findOne({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      lotNumber: testLot
    });
    assert(inwardItem !== null, 'Inward stock item created in centralized inventory');
    assert(inwardItem.quantityOnHand >= inwardQty, `Stock on hand reflects inward quantity (${inwardItem.quantityOnHand} >= ${inwardQty})`);
    assert(inwardItem.expiryDate !== null, 'Expiry date preserved for FIFO tracking');

    // Test Outward removal from specific lot
    const outwardRemovalQty = 150;
    await InventoryLedgerService.recordTransaction({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: outwardRemovalQty,
      type: 'OUTWARD_DISPATCH',
      batchNumber: testLot,
      lotNumber: testLot,
      sourceDocType: 'ManualOutward',
      reason: 'Material Dispatch to Production',
      userId: adminUser._id
    });

    const outwardItem = await InventoryItem.findOne({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      lotNumber: testLot
    });
    const expectedRemaining = inwardQty - outwardRemovalQty;
    assert(outwardItem.quantityOnHand === expectedRemaining, `Outward deduction accurate: ${outwardItem.quantityOnHand} === ${expectedRemaining}`);

    // -------------------------------------------------------------
    // TEST 4: INTER-WAREHOUSE STOCK TRANSFER
    // -------------------------------------------------------------
    console.log('\n--- 4. INTER-WAREHOUSE STOCK TRANSFER ---');
    let destWarehouse = await Warehouse.findOne({ _id: { $ne: warehouse._id }, status: 'Active' });
    if (!destWarehouse) {
      destWarehouse = await Warehouse.create({
        code: `WH-DEST-${Date.now().toString().slice(-4)}`,
        name: 'Secondary Transit Warehouse',
        siteId: site._id,
        status: 'Active'
      });
    }

    const transferQty = 50;
    await InventoryLedgerService.recordTransaction({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: transferQty,
      type: 'TRANSFER_OUT',
      batchNumber: testLot,
      lotNumber: testLot,
      referenceId: destWarehouse.name,
      reason: `Transfer to ${destWarehouse.name}`,
      userId: adminUser._id
    });

    await InventoryLedgerService.recordTransaction({
      materialId: rawMaterial._id,
      warehouseId: destWarehouse._id,
      siteId: destWarehouse.siteId || site._id,
      quantity: transferQty,
      type: 'TRANSFER_IN',
      batchNumber: testLot,
      lotNumber: testLot,
      mfgDate: inwardItem.mfgDate,
      expiryDate: inwardItem.expiryDate,
      referenceId: warehouse.name,
      reason: `Transfer from ${warehouse.name}`,
      userId: adminUser._id
    });

    const destItem = await InventoryItem.findOne({
      materialId: rawMaterial._id,
      warehouseId: destWarehouse._id,
      lotNumber: testLot
    });
    assert(destItem !== null && destItem.quantityOnHand >= transferQty, `Destination warehouse received stock with preserved lot number (${destItem?.quantityOnHand})`);

    // -------------------------------------------------------------
    // TEST 5: LOT RECONCILIATION / EDIT
    // -------------------------------------------------------------
    console.log('\n--- 5. LOT RECONCILIATION / EDIT (PHYSICAL COUNT DELTA) ---');
    const beforeReconcileQty = outwardItem.quantityOnHand;
    const physicalCount = beforeReconcileQty - 10;
    const delta = physicalCount - beforeReconcileQty;

    await InventoryLedgerService.recordTransaction({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: Math.abs(delta),
      type: delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      batchNumber: testLot,
      lotNumber: testLot,
      sourceDocType: 'PhysicalInventoryAudit',
      reason: 'Physical count audit difference -10 kg',
      userId: adminUser._id
    });

    const reconciledItem = await InventoryItem.findOne({
      materialId: rawMaterial._id,
      warehouseId: warehouse._id,
      lotNumber: testLot
    });
    assert(reconciledItem.quantityOnHand === physicalCount, `Lot physical count reconciled: ${reconciledItem.quantityOnHand} === ${physicalCount}`);

    // -------------------------------------------------------------
    // TEST 6: PLANNING DEMAND & SIMULATION (SHEET 3 BLUEPRINT)
    // -------------------------------------------------------------
    console.log('\n--- 6. PLANNING MRP SIMULATION (SHEET 3 BLUEPRINT) ---');
    const finishedGood = await Material.findOne({ type: 'Finished' }) || sampleBom.productId;
    const { simulatePlanningDemand } = require('../controllers/productionPlanController');

    let simulationResponse = null;
    const mockReq = {
      body: {
        productId: finishedGood._id.toString(),
        demandQty: 4000,
        siteId: site._id.toString()
      },
      user: adminUser
    };
    const mockRes = {
      status: (code) => ({
        json: (data) => { simulationResponse = { code, ...data }; }
      })
    };

    await simulatePlanningDemand(mockReq, mockRes, (err) => { if (err) throw err; });

    assert(simulationResponse !== null, 'Planning simulation endpoint executed');
    assert(simulationResponse.success === true, 'Simulation succeeded');
    const simData = simulationResponse.data;

    assert(simData.planSummary && simData.planSummary.length > 0, 'Generated Tier 1 Plan Summary');
    console.log(`    Plan Summary: Demand=${simData.planSummary[0].demandQty}, Batches=${simData.planSummary[0].noOfBatches}, Output=${simData.planSummary[0].targetOutputQty}`);

    assert(simData.batchSummary && simData.batchSummary.length === simData.planSummary[0].noOfBatches, `Generated Tier 2 Batch Summary with ${simData.batchSummary.length} discrete batches`);

    assert(simData.materialSummary && simData.materialSummary.length > 0, `Generated Tier 3 Material Summary with ${simData.materialSummary.length} exploded ingredients`);
    const firstIng = simData.materialSummary[0];
    console.log(`    Ingredient Sample: ${firstIng.material} (MPN: ${firstIng.mpn}, Req: ${firstIng.qtyReq}, Avail: ${firstIng.qtyAvail}, Short/Long: ${firstIng.diff} [${firstIng.status}])`);

    assert(simData.maxProducible !== undefined, 'Computed Maximum Producible Quantity and bottleneck analysis');
    console.log(`    Bottleneck Analysis: Max Producible=${simData.maxProducible.maxProducibleQty} ${simData.maxProducible.uom}, Limiting Ingredient="${simData.maxProducible.bottleneckMaterial}"`);
    assert(simData.maxProducible.maxBatches !== undefined, `Limiting Batches: ${simData.maxProducible.maxBatches}`);

    // -------------------------------------------------------------
    // TEST 7: MANUFACTURING BATCH EXECUTION & VARIANCE GATE
    // -------------------------------------------------------------
    console.log('\n--- 7. MANUFACTURING BATCH EXECUTION & 5% VARIANCE GATE ---');
    const { executeBatch, adjustDynamicIpOp } = require('../controllers/batchExecutionController');

    let varianceGateRejected = false;
    const rejectedReq = {
      body: {
        batchNumber: `GATE-TEST-${Date.now().toString().slice(-4)}`,
        productId: finishedGood._id.toString(),
        bomId: sampleBom._id.toString(),
        planOutputQty: 1000,
        actualOutputQty: 1100,
        varianceReason: '',
        siteId: site._id.toString(),
        warehouseId: warehouse._id.toString()
      },
      user: adminUser
    };
    const rejectedRes = {
      status: (code) => ({
        json: (data) => {
          if (code === 400 && data.error && data.error.includes('exceeds the 5% tolerance')) {
            varianceGateRejected = true;
          }
        }
      })
    };
    await executeBatch(rejectedReq, rejectedRes, (e) => {});
    assert(varianceGateRejected, '5% Variance Gate successfully blocks excessive variance without justification');

    let executedOrder = null;
    const batchNo = `EXEC-${Date.now().toString().slice(-5)}`;
    const validExecReq = {
      body: {
        batchNumber: batchNo,
        productId: finishedGood._id.toString(),
        bomId: sampleBom._id.toString(),
        planOutputQty: 1000,
        actualOutputQty: 1030,
        consumeLots: true,
        siteId: site._id.toString(),
        warehouseId: warehouse._id.toString(),
        inputs: sampleBom.components.map(c => ({
          materialId: c.materialId?._id || c.materialId,
          planInputQty: c.quantity || 10,
          actualInputQty: c.quantity || 10
        }))
      },
      user: adminUser
    };
    const validExecRes = {
      status: (code) => ({
        json: (data) => { executedOrder = data.data; }
      })
    };
    await executeBatch(validExecReq, validExecRes, (e) => {});
    assert(executedOrder !== null, `Batch ${batchNo} executed and recorded in ProductionOrder`);

    const fgItem = await InventoryItem.findOne({
      materialId: finishedGood._id,
      lotNumber: batchNo
    });
    assert(fgItem !== null && fgItem.quantityOnHand >= 1030, `Finished Goods added to centralized stock: ${fgItem?.quantityOnHand} units`);

    // -------------------------------------------------------------
    // TEST 8: DYNAMIC IP/OP POST-ENTRY EDITING
    // -------------------------------------------------------------
    console.log('\n--- 8. DYNAMIC IP/OP POST-ENTRY ADJUSTMENT ---');
    let adjustedOrder = null;
    const adjustReq = {
      params: { id: executedOrder._id.toString() },
      body: {
        actualOutputQty: 1050,
        adjustmentReason: 'Post-cooling scale correction',
        inputs: executedOrder.components.map(c => ({
          materialId: c.materialId,
          actualInputQty: (c.actualQuantity || 10) + 2
        }))
      },
      user: adminUser
    };
    const adjustRes = {
      status: (code) => ({
        json: (data) => { adjustedOrder = data.data; }
      })
    };
    await adjustDynamicIpOp(adjustReq, adjustRes, (e) => {});
    assert(adjustedOrder !== null, 'Dynamic IP/OP adjustment succeeded');
    assert(adjustedOrder.actualQuantity === 1050, `Batch actual quantity updated to ${adjustedOrder?.actualQuantity}`);

    const updatedFgItem = await InventoryItem.findOne({
      materialId: finishedGood._id,
      lotNumber: batchNo
    });
    assert(updatedFgItem.quantityOnHand === 1050, `Centralized inventory automatically re-balanced to ${updatedFgItem?.quantityOnHand}`);

    const corrTxn = await InventoryTransaction.findOne({
      referenceId: `CORR-${batchNo}`
    });
    assert(corrTxn !== null, 'Audited compensatory transaction recorded in centralized inventory ledger');

    console.log('\n===============================================================');
    console.log(`VERIFICATION SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log('===============================================================\n');

  } catch (error) {
    console.error('Execution error in verification test:', error);
    results.failed++;
  } finally {
    await mongoose.disconnect();
    process.exit(results.failed > 0 ? 1 : 0);
  }
}

runVerification();
