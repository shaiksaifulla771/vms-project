const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const BOM = require('../models/BOM');
const { getBOMs, getBOM, createBOM, updateBOM, duplicateBOM, deleteBOM, restoreBOM } = require('../controllers/bomController');

dotenv.config({ path: '../.env' });

async function runTest() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test_bom_char');
  await mongoose.connection.db.dropDatabase();

  console.log('--- STARTING BOM CHARACTERIZATION ---');

  const createMockRes = () => {
    const res = {
      statusCode: null,
      data: null,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.data = data;
        return this;
      }
    };
    return res;
  };

  const next = (err) => { 
    if (err) {
      console.log('Error caught by next():', err.message);
    }
  };

  try {
    // -----------------------------------------------------
    // Seed Dependencies (Material, Vendor, MPN)
    // -----------------------------------------------------
    const matProduct = await Material.create({
      name: 'Test Product', code: 'PROD-001', unit: 'pcs', type: 'Finished', status: 'Active'
    });
    const matComp1 = await Material.create({
      name: 'Test Component', code: 'COMP-001', unit: 'kg', type: 'Raw Material', status: 'Active'
    });
    const ven = await Vendor.create({
      name: 'Test Vendor', company: 'TV Inc', email: 'test@example.com', status: 'Active', category: 'Packaging'
    });
    const mpn1 = await MPN.create({
      materialId: matComp1._id,
      vendorId: ven._id,
      mpnCode: 'MPN-001',
      manufacturerName: 'Manuf1',
      manufacturerPartNumber: 'PART-123',
      price: 100,
      uom: 'kg',
      status: 'Active'
    });

    // -----------------------------------------------------
    // Test 1: createBOM (Valid)
    // -----------------------------------------------------
    console.log('\n--- Test 1: createBOM (Valid) ---');
    const req1 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      body: {
        productId: matProduct._id.toString(),
        batchSize: 10,
        batchUOM: 'pcs',
        components: [
          { mpnId: mpn1._id.toString(), qty: 2, lossPercent: 10 }
        ],
        packagingCost: 5,
        processingCost: 15,
        overheadCost: 10
      }
    };
    const res1 = createMockRes();
    await createBOM(req1, res1, next);
    
    if (res1.statusCode === 201 && res1.data.data) {
      const bomData = res1.data.data;
      console.log(`Status: ${res1.statusCode}`);
      console.log(`BOM Number: ${bomData.bomNumber}`);
      console.log(`Version: ${bomData.version}`);
      console.log(`Components Saved: ${bomData.components.length}`);
      // Note: bomCostService calculates cost, but it's not saved on the BOM model itself except packaging/processing/overhead
      console.log(`Packaging Cost: ${bomData.packagingCost}`);
    } else {
      console.log(`Failed with status: ${res1.statusCode}`, res1.data);
    }
    const createdBomId = res1.data.data._id.toString();

    // -----------------------------------------------------
    // Test 2: createBOM (Missing Required Component Qty)
    // -----------------------------------------------------
    console.log('\n--- Test 2: createBOM (Invalid Qty) ---');
    const req2 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      body: {
        productId: matProduct._id.toString(),
        batchSize: 10,
        batchUOM: 'pcs',
        components: [
          { mpnId: mpn1._id.toString(), qty: -5, lossPercent: 10 }
        ]
      }
    };
    const res2 = createMockRes();
    await createBOM(req2, res2, next);
    console.log(`Validation Expected -> Status: ${res2.statusCode || 'Caught by next()'}`);

    // -----------------------------------------------------
    // Test 3: updateBOM (Partial update - no version bump)
    // -----------------------------------------------------
    console.log('\n--- Test 3: updateBOM (Status only - No Version Bump) ---');
    const req3 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      params: { id: createdBomId },
      body: { status: 'Draft' }
    };
    const res3 = createMockRes();
    await updateBOM(req3, res3, next);
    console.log(`Status: ${res3.statusCode}`);
    console.log(`New Status: ${res3.data.data.status}`);
    console.log(`Version (Should still be 1): ${res3.data.data.version}`);

    // -----------------------------------------------------
    // Test 4: updateBOM (Full update - Version Bump)
    // -----------------------------------------------------
    console.log('\n--- Test 4: updateBOM (Components change - Version Bump) ---');
    const req4 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      params: { id: createdBomId },
      body: {
        productId: matProduct._id.toString(), // Requires full body
        batchSize: 10,
        batchUOM: 'pcs',
        version: 1, // Providing current version for lock check
        components: [
          { mpnId: mpn1._id.toString(), qty: 3, lossPercent: 5 } // Changed qty
        ]
      }
    };
    const res4 = createMockRes();
    await updateBOM(req4, res4, next);
    console.log(`Status: ${res4.statusCode}`);
    console.log(`New Version: ${res4.data.data.version}`);
    const v2BomId = res4.data.data._id.toString();

    // Verify V1 status
    const v1Bom = await BOM.findById(createdBomId);
    console.log(`V1 BOM Status after bump: ${v1Bom.status}`);

    // -----------------------------------------------------
    // Test 5: updateBOM (Version Conflict)
    // -----------------------------------------------------
    console.log('\n--- Test 5: updateBOM (Version Conflict) ---');
    const req5 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      params: { id: v2BomId },
      body: {
        productId: matProduct._id.toString(),
        batchSize: 10,
        batchUOM: 'pcs',
        version: 1, // Wrong version (it's currently 2)
        components: [
          { mpnId: mpn1._id.toString(), qty: 4, lossPercent: 5 }
        ]
      }
    };
    const res5 = createMockRes();
    await updateBOM(req5, res5, next);
    console.log(`Status: ${res5.statusCode}`);
    console.log(`Error Message: ${res5.data ? res5.data.error : 'None'}`);

    // -----------------------------------------------------
    // Test 6: duplicateBOM
    // -----------------------------------------------------
    console.log('\n--- Test 6: duplicateBOM ---');
    const req6 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      params: { id: v2BomId },
      connection: { remoteAddress: '127.0.0.1' },
      ip: '127.0.0.1'
    };
    const res6 = createMockRes();
    await duplicateBOM(req6, res6, next);
    console.log(`Status: ${res6.statusCode}`);
    console.log(`Duplicated BOM Number: ${res6.data.data.bomNumber}`);
    console.log(`Duplicated Version: ${res6.data.data.version}`);
    console.log(`Duplicated From original ID: ${res6.data.data.duplicatedFrom}`);
    const dupBomId = res6.data.data._id.toString();

    // -----------------------------------------------------
    // Test 7: deleteBOM (Soft Delete)
    // -----------------------------------------------------
    console.log('\n--- Test 7: deleteBOM ---');
    const req7 = {
      user: { id: '507f1f77bcf86cd799439011', name: 'TestUser' },
      params: { id: dupBomId }
    };
    const res7 = createMockRes();
    await deleteBOM(req7, res7, next);
    console.log(`Status: ${res7.statusCode}`);
    console.log(`Message: ${res7.data.message}`);

    // Verify status
    const deletedBom = await BOM.findById(dupBomId);
    console.log(`DB Status after delete: ${deletedBom.status}`);

    // -----------------------------------------------------
    // Test 8: getBOMs (List/Search)
    // -----------------------------------------------------
    console.log('\n--- Test 8: getBOMs (Search & Dynamic Pricing) ---');
    const req8 = {
      query: { search: 'Test Product' }
    };
    const res8 = createMockRes();
    await getBOMs(req8, res8, next);
    console.log(`Status: ${res8.statusCode}`);
    console.log(`Count Returned: ${res8.data.count}`);
    if (res8.data.count > 0) {
      console.log(`Returned BOM liveTotalCost dynamically populated: ${res8.data.data[0].liveTotalCost > 0 ? 'Yes (' + res8.data.data[0].liveTotalCost.toFixed(2) + ')' : 'No'}`);
    }

  } catch (err) {
    console.error('Test Suite Failed:', err);
  } finally {
    console.log('\n--- CHARACTERIZATION COMPLETE ---');
    process.exit(0);
  }
}

runTest();
