const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const Sequence = require('../models/Sequence');

const { bulkCreateMPNs } = require('../controllers/mpnController');

async function runTest() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    console.log(`Connecting to database for MPN Bulk Test: ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    console.log('Fetching sample active vendor and material...');
    let vendor = await Vendor.findOne({ status: { $ne: 'Deleted' } });
    let material = await Material.findOne({ status: { $ne: 'Deleted' } });

    if (!vendor) {
      console.log('Creating mock active vendor...');
      vendor = await Vendor.create({
        name: 'Bulk Test Vendor',
        company: 'Bulk Vendor Corp',
        category: 'Electronics',
        status: 'Active',
      });
    }

    if (!material) {
      console.log('Creating mock active material...');
      material = await Material.create({
        name: 'Bulk Test Material',
        code: 'MAT-BULK-99',
        type: 'Raw Material',
        unit: 'pcs',
      });
    }

    console.log(`Using Vendor: ${vendor._id} (${vendor.name}), Material: ${material._id} (${material.name})`);

    const mockReq = {
      user: { _id: new mongoose.Types.ObjectId() },
      body: {
        rows: [
          {
            temp_id: 'temp-row-1',
            mpnName: 'Bulk Resistor 10k',
            manufacturerName: 'TEXAS INSTRUMENTS',
            manufacturerPartNumber: `TI-RES-${Date.now()}-1`,
            materialId: material._id.toString(),
            vendorId: vendor._id.toString(),
            price: 15.5,
            moq: 10,
            status: 'Active',
          },
          {
            temp_id: 'temp-row-2',
            mpnName: 'Bulk Capacitor 100uF',
            manufacturerName: 'PANASONIC',
            manufacturerPartNumber: `PAN-CAP-${Date.now()}-2`,
            materialId: material._id.toString(),
            vendorId: vendor._id.toString(),
            price: 45.0,
            moq: 5,
            status: 'Active',
          },
          {
            temp_id: 'temp-row-3-invalid',
            mpnName: 'Invalid Row No Vendor',
            manufacturerName: 'UNKNOWN',
            manufacturerPartNumber: 'UNK-001',
            materialId: material._id.toString(),
            vendorId: '', // Invalid missing vendor
            price: 10.0,
            status: 'Active',
          },
        ],
      },
    };

    let responseData = null;
    let statusCode = 200;

    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        responseData = data;
        return mockRes;
      },
    };

    const mockNext = (err) => {
      console.error('Error passed to next():', err);
    };

    console.log('Executing bulkCreateMPNs controller function...');
    await bulkCreateMPNs(mockReq, mockRes, mockNext);

    console.log(`Response Status Code: ${statusCode}`);
    console.log('Response Payload:', JSON.stringify(responseData, null, 2));

    if (responseData && responseData.success && responseData.count === 2) {
      console.log('✅ MPN Bulk Create backend test PASSED seamlessly!');
    } else {
      console.error('❌ MPN Bulk Create backend test FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error running MPN Bulk Create test:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
