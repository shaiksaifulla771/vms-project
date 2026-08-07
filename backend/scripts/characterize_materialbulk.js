const mongoose = require('mongoose');
const dotenv = require('dotenv');
const XLSX = require('xlsx');
const Material = require('../models/Material');
const Sequence = require('../models/Sequence');
const InventoryItem = require('../models/InventoryItem');
const { createMaterialsBatch, createMaterialsBatchUpload, deleteMaterialsBySource, batchDeleteMaterials } = require('../controllers/materialController');

dotenv.config({ path: '../.env' });

async function runTest() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test_matbulk_char');
  await mongoose.connection.db.dropDatabase();

  console.log('--- STARTING MATERIAL BULK CHARACTERIZATION ---');

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
    console.error('Error in next:', err.message); 
    throw err;
  };

  try {
    // -----------------------------------------------------
    // Test 1: createMaterialsBatch (JSON Array)
    // -----------------------------------------------------
    console.log('\n--- Test 1: createMaterialsBatch ---');
    const req1 = {
      body: {
        items: [
          { name: 'Bulk Material 1', code: 'BM-001', unit: 'kg', type: 'Raw Material' },
          { name: 'Bulk Material 2', code: 'BM-002', unit: 'pcs' },
          { name: 'Missing Required', code: 'BM-003' } // Missing unit
        ],
        importSource: 'API JSON Upload'
      }
    };
    const res1 = createMockRes();
    try {
      await createMaterialsBatch(req1, res1, next);
      console.log(`Status: ${res1.statusCode}`);
      console.log(`Inserted: ${res1.data.insertedCount}, Errors: ${res1.data.errorsCount}`);
    } catch (e) {
      console.log(`Test 1 threw existing error: ${e.message}`);
    }
    
    // Verify InventoryItem initialization (if it succeeded)
    const bm1 = await Material.findOne({ code: 'BM-001' });
    if (bm1) {
      const inv1 = await InventoryItem.findOne({ materialId: bm1._id });
      console.log(`Inventory initialized for BM-001: ${inv1 ? 'Yes, balance: ' + inv1.balance : 'No'}`);
    } else {
      console.log('BM-001 not created due to error.');
    }


    // -----------------------------------------------------
    // Test 2: createMaterialsBatchUpload (Excel File)
    // -----------------------------------------------------
    console.log('\n--- Test 2: createMaterialsBatchUpload (Excel) ---');
    
    // Create an Excel buffer in memory
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Material Name', 'Material Code', 'Unit of Measurement', 'Category', 'Sub Category', 'Notes'],
      ['Excel Mat 1', 'EX-001', 'L', 'Raw Material', 'Liquids', 'Note 1'],
      ['Excel Mat Auto 1', '', 'pcs', 'Packaged Material', 'Boxes', 'Will get M-code'],
      ['Excel Mat Auto 2', '', 'pcs', 'Packaged Material', 'Boxes', 'Will get next M-code'],
      ['Excel Mat Duplicate', 'EX-001', 'L', 'Raw Material', '', 'Should update existing']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Pre-seed an M-code to test sequence iteration
    await Sequence.findOneAndUpdate({ _id: 'materialCode' }, { $set: { seq: 5000 } }, { upsert: true });

    const req2 = {
      file: { buffer: excelBuffer, originalname: 'test_upload.xlsx' },
      body: { importSource: 'Excel Stream Upload', isAutoEntry: 'true' }
    };
    const res2 = createMockRes();
    try {
      await createMaterialsBatchUpload(req2, res2, next);
      
      console.log(`Status: ${res2.statusCode}`);
      console.log(`Inserted: ${res2.data.insertedCount}, Updated: ${res2.data.updatedCount}, Errors: ${res2.data.errorsCount}`);
      
      // Verify auto-generated codes
      const autoMats = await Material.find({ name: /^Excel Mat Auto/ }).sort({ code: 1 });
      console.log(`Auto codes generated: ${autoMats.map(m => m.code).join(', ')}`);
    } catch (e) {
      console.log(`Test 2 threw existing error: ${e.message}`);
    }


    // -----------------------------------------------------
    // Test 3: deleteMaterialsBySource
    // -----------------------------------------------------
    console.log('\n--- Test 3: deleteMaterialsBySource ---');
    const req3 = {
      body: { source: 'API JSON Upload' }
    };
    const res3 = createMockRes();
    await deleteMaterialsBySource(req3, res3, next);
    
    console.log(`Status: ${res3.statusCode}`);
    console.log(`Message: ${res3.data.message}`);

    const verifyDel1 = await Material.findOne({ code: 'BM-001' });
    console.log(`BM-001 Status after delete: ${verifyDel1.status}`);


    // -----------------------------------------------------
    // Test 4: batchDeleteMaterials (by IDs)
    // -----------------------------------------------------
    console.log('\n--- Test 4: batchDeleteMaterials ---');
    const ex1 = await Material.findOne({ code: 'BM-002' });
    
    if (ex1) {
      const req4 = {
        body: { ids: [ex1._id.toString()] }
      };
      const res4 = createMockRes();
      await batchDeleteMaterials(req4, res4, next);
      
      console.log(`Status: ${res4.statusCode}`);
      console.log(`Message: ${res4.data.message}`);

      const verifyDel2 = await Material.findOne({ code: 'BM-002' });
      console.log(`BM-002 Status after delete: ${verifyDel2.status}`);
    } else {
      console.log('BM-002 not found for Test 4.');
    }

  } catch (err) {
    console.error('Test Suite Failed:', err);
  } finally {
    console.log('\n--- CHARACTERIZATION COMPLETE ---');
    process.exit(0);
  }
}

runTest();
