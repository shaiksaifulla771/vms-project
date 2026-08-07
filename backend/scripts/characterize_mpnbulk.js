const mongoose = require('mongoose');
const dotenv = require('dotenv');
const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const { bulkCreateMPNs } = require('../controllers/mpnController');

dotenv.config({ path: '../.env' });

async function runTest() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test_mpnbulk_char');
  await mongoose.connection.db.dropDatabase();

  const vendor = await Vendor.create({ name: 'Bulk Vendor', email: 'bulk@v.com', vendorId: 'V2000', gstin: '27AABCU9603R1ZX' });
  const material = await Material.create({ name: 'Bulk Material', code: 'M2000', unit: 'pcs' });

  // Add an existing MPN to test duplicates
  await MPN.create({
    mpnCode: 'MPN9999',
    manufacturerPartNumber: 'EXISTING-123',
    mpnName: 'Existing MPN',
    manufacturerName: 'EXISTING MANUF',
    materialId: material._id,
    vendorId: vendor._id,
    price: 10,
    status: 'Active'
  });

  const mockReq = {
    user: { name: 'TestUser' },
    body: {
      rows: [
        // 1. Valid Active Row
        {
          temp_id: 'row1',
          status: 'Active',
          vendorId: vendor._id.toString(),
          materialId: material._id.toString(),
          manufacturerName: 'Bulk Manuf',
          mpnName: 'Valid MPN',
          price: 100,
          moq: 10,
          manufacturerPartNumber: 'BULK-001'
        },
        // 2. Draft Row (Missing fields allowed)
        {
          temp_id: 'row2',
          status: 'Draft',
          manufacturerName: 'Draft Manuf',
          mpnName: 'Draft MPN',
          manufacturerPartNumber: 'DRAFT-001'
        },
        // 3. Invalid Row (Active missing Vendor)
        {
          temp_id: 'row3',
          status: 'Active',
          materialId: material._id.toString(),
          manufacturerName: 'Invalid Manuf',
          mpnName: 'Missing Vendor',
          price: 50,
          moq: 5,
          manufacturerPartNumber: 'INV-001'
        },
        // 4. Duplicate Code Row
        {
          temp_id: 'row4',
          status: 'Active',
          vendorId: vendor._id.toString(),
          materialId: material._id.toString(),
          manufacturerName: 'Dup Manuf',
          mpnName: 'Duplicate MPN',
          price: 100,
          moq: 10,
          mpnCode: 'MPN9999', // Matches existing
          manufacturerPartNumber: 'DUP-001'
        },
        // 5. Invalid Vendor ID mapping
        {
          temp_id: 'row5',
          status: 'Active',
          vendorId: new mongoose.Types.ObjectId().toString(), // Non-existent
          materialId: material._id.toString(),
          manufacturerName: 'Bad Vendor Manuf',
          mpnName: 'Bad Vendor MPN',
          price: 100,
          moq: 10,
          manufacturerPartNumber: 'BADV-001'
        }
      ]
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

  console.log('--- STARTING BULK CHARACTERIZATION ---');
  await bulkCreateMPNs(mockReq, mockRes, next);

  console.log('HTTP Status:', mockRes.statusCode);
  console.log('Total Processed:', mockRes.data.total);
  console.log('Success Count:', mockRes.data.count);

  mockRes.data.results.forEach(r => {
    console.log(`[${r.temp_id}] Status: ${r.status}${r.error ? ` | Error: ${r.error}` : ` | Code: ${r.mpnCode}`}`);
  });

  console.log('--- CHARACTERIZATION COMPLETE ---');
  process.exit(0);
}

runTest().catch(console.error);
