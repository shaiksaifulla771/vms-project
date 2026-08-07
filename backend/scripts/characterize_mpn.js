const mongoose = require('mongoose');
const dotenv = require('dotenv');
const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const { createMPN } = require('../controllers/mpnController');

dotenv.config({ path: '../.env' });

async function runTest() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test_mpn_char');
  await mongoose.connection.db.dropDatabase();

  const vendor = await Vendor.create({ name: 'Test Vendor', email: 'test@v.com', vendorId: 'V1000', gstin: '27AABCU9603R1ZX' });
  const material = await Material.create({ name: 'Test Material', code: 'M1000', unit: 'pcs' });

  // Mock Request and Response
  const mockReq = {
    body: {
      status: 'Active',
      vendorId: vendor._id.toString(),
      materialId: material._id.toString(),
      manufacturerName: '  test  manuf ',
      mpnName: 'Test MPN',
      price: 100,
      moq: 10,
      manufacturerPartNumber: 'PART-123'
    }
  };

  const mockRes = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.data = data;
      return this;
    }
  };

  const next = (err) => { console.error('Error in next:', err); };

  // Test 1: Successful Create
  await createMPN(mockReq, mockRes, next);
  console.log('Test 1 (Create Active): Status:', mockRes.statusCode);
  console.log('Resulting MPN Code:', mockRes.data.data.mpnCode);
  console.log('Normalized Manufacturer:', mockRes.data.data.manufacturerName);
  console.log('GSTIN check (should be empty since Vendor has it):', mockRes.data.data.gstin === '');

  // Test 2: Draft Fallback
  mockReq.body = {
    status: 'Draft',
    manufacturerName: 'test manuf',
  };
  await createMPN(mockReq, mockRes, next);
  console.log('Test 2 (Create Draft with missing required): Status:', mockRes.statusCode);
  console.log('Draft Price fallback:', mockRes.data.data.price === 1);

  // Test 3: Duplicate Active
  mockReq.body = {
    status: 'Active',
    vendorId: vendor._id.toString(),
    materialId: material._id.toString(),
    manufacturerName: 'test manuf',
    price: 50,
    moq: 5,
    manufacturerPartNumber: 'PART-123' // Same as Test 1
  };
  await createMPN(mockReq, mockRes, next);
  console.log('Test 3 (Duplicate Active): Status:', mockRes.statusCode);
  console.log('Duplicate Error:', mockRes.data.error);

  console.log('\n--- CHARACTERIZATION COMPLETE ---');
  process.exit(0);
}

runTest().catch(console.error);
