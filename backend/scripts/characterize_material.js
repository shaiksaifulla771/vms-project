const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Material = require('../models/Material');
const Sequence = require('../models/Sequence');
const { createMaterial, updateMaterial, deleteMaterial } = require('../controllers/materialController');

dotenv.config({ path: '../.env' });

async function runTest() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test_mat_char');
  await mongoose.connection.db.dropDatabase();

  console.log('--- STARTING MATERIAL CHARACTERIZATION ---');

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
    // Test 1: Create a valid material
    const req1 = {
      user: { id: '507f1f77bcf86cd799439011' },
      body: {
        name: 'Pumpkin Puree',
        code: 'PUMP-001',
        unit: 'kg',
        type: 'Raw Material',
        subcategory: 'Fresh Produce'
      }
    };
    const res1 = createMockRes();
    await createMaterial(req1, res1, next);
    console.log(`Test 1 (Valid Create): Status ${res1.statusCode}, Code: ${res1.data.data.code}`);

    // Test 2: Create material with existing code
    const req2 = {
      user: { id: '507f1f77bcf86cd799439011' },
      body: {
        name: 'Another Pumpkin',
        code: 'pump-001', // Lowercase to test uppercase uniqueness mapping
        unit: 'kg'
      }
    };
    const res2 = createMockRes();
    await createMaterial(req2, res2, (err) => console.log('Test 2 Next Error:', err.message));
    console.log(`Test 2 (Duplicate Create): Status ${res2.statusCode}, Error: ${res2.data?.error || 'Caught by next'}`);

    // Test 3: Create without code but valid M-sequence auto-assignment logic
    // Wait, createMaterial doesn't auto-assign missing codes, it requires code.
    // Let's test missing required field.
    const req3 = {
      user: { id: '507f1f77bcf86cd799439011' },
      body: {
        name: 'Missing Code',
        unit: 'kg'
      }
    };
    const res3 = createMockRes();
    await createMaterial(req3, res3, next);
    console.log(`Test 3 (Missing Code): Status ${res3.statusCode}, Error: ${res3.data?.error}`);

    // Test 4: Update existing material
    const req4 = {
      user: { id: '507f1f77bcf86cd799439011' },
      params: { id: res1.data.data._id.toString() },
      body: {
        name: 'Updated Pumpkin Puree',
        description: 'Now 100% organic'
      }
    };
    const res4 = createMockRes();
    await updateMaterial(req4, res4, next);
    console.log(`Test 4 (Valid Update): Status ${res4.statusCode}, Name: ${res4.data.data.name}`);

    // Test 5: Soft delete material
    const req5 = {
      user: { id: '507f1f77bcf86cd799439011' },
      params: { id: res1.data.data._id.toString() }
    };
    const res5 = createMockRes();
    await deleteMaterial(req5, res5, next);
    console.log(`Test 5 (Soft Delete): Status ${res5.statusCode}, Message: ${res5.data.message}`);
    
    // Verify it in DB
    const deletedMat = await Material.findById(res1.data.data._id);
    console.log(`Test 5 DB Verification: Status is ${deletedMat.status}`);

  } catch (err) {
    console.error('Test Suite Failed:', err);
  } finally {
    console.log('--- CHARACTERIZATION COMPLETE ---');
    process.exit(0);
  }
}

runTest();
