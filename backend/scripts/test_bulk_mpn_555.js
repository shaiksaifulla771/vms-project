const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const Sequence = require('../models/Sequence');

const { bulkCreateMPNs } = require('../controllers/mpnController');

async function run555Test() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    console.log(`==================== STARTING 5 MATERIAL, 5 VENDOR, 5 MPN BULK TEST ====================`);
    console.log(`Connecting to MongoDB: ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    const timestamp = Date.now();

    // 1. Create 5 Unique Active Materials
    console.log('\n--- Step 1: Creating 5 Active Materials ---');
    const createdMaterials = [];
    for (let i = 1; i <= 5; i++) {
      const mat = await Material.create({
        name: `Test Raw Component ${i}_${timestamp}`,
        code: `M555-${timestamp}-${i}`,
        type: 'Raw Material',
        unit: 'pcs',
        basePrice: 100 * i,
        status: 'Active',
        description: `Automated test raw material ${i}`,
      });
      createdMaterials.push(mat);
      console.log(`  [Material ${i}] ID: ${mat._id} | Code: ${mat.code} | Name: ${mat.name}`);
    }

    // 2. Create 5 Unique Active Vendors
    console.log('\n--- Step 2: Creating 5 Active Vendors ---');
    const createdVendors = [];
    for (let i = 1; i <= 5; i++) {
      const ven = await Vendor.create({
        vendorId: `V555-${timestamp}-${i}`,
        name: `Sourcing Partner ${i}_${timestamp}`,
        company: `Global Logistics Corp ${i}`,
        category: 'Electronics',
        gstin: `27AAAAA${1000 + i}A1Z${i}`,
        phone: `+91-98765-4321${i}`,
        email: `vendor${i}_${timestamp}@sourcing.com`,
        address: `Sector ${i}, Sourcing Industrial Estate`,
        status: 'Active',
      });
      createdVendors.push(ven);
      console.log(`  [Vendor ${i}] ID: ${ven._id} | Name: ${ven.name} | GSTIN: ${ven.gstin}`);
    }

    // 3. Build 5 Bulk MPN Rows with ALL fields populated
    console.log('\n--- Step 3: Preparing 5 Bulk MPN Rows with All Fields Filled ---');
    const bulkRows = [];
    for (let i = 0; i < 5; i++) {
      const mat = createdMaterials[i];
      const ven = createdVendors[i];
      const row = {
        temp_id: `test-555-temp-${i + 1}-${timestamp}`,
        manufacturerPartNumber: `MPN-PART-FULL-${timestamp}-${i + 1}`,
        mpnName: `High Precision Component Spec ${i + 1}`,
        manufacturerName: i % 2 === 0 ? ven.name : `TEXAS INSTRUMENTS CORP ${i + 1}`,
        isDirectFromManufacturer: i % 2 === 0,
        materialId: mat._id.toString(),
        vendorId: ven._id.toString(),
        price: (149.99 * (i + 1)).toFixed(2),
        moq: (i + 1) * 5,
        gstin: ven.gstin,
        partDescription: `Complete technical specification notes, datasheet URL: https://datasheets.example.com/item-${i + 1}.pdf`,
        status: 'Active',
      };
      bulkRows.push(row);
      console.log(`  [Payload ${i + 1}] PartNo: ${row.manufacturerPartNumber} | Price: ₹${row.price} | MOQ: ${row.moq}`);
    }

    // 4. Invoke bulkCreateMPNs controller
    console.log('\n--- Step 4: Invoking bulkCreateMPNs Endpoint ---');
    const mockReq = {
      user: { _id: new mongoose.Types.ObjectId(), name: 'Test Execution Admin' },
      body: { rows: bulkRows },
    };

    let statusCode = 200;
    let responseData = null;

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

    await bulkCreateMPNs(mockReq, mockRes, mockNext);

    console.log(`HTTP Response Status: ${statusCode}`);
    console.log('Response Payload:', JSON.stringify(responseData, null, 2));

    // 5. Verify database records
    console.log('\n--- Step 5: Database Verification ---');
    const createdMpnCodes = (responseData.results || [])
      .filter((r) => r.status === 'success')
      .map((r) => r.mpnCode);

    console.log(`Created MPN Codes: ${createdMpnCodes.join(', ')}`);

    const dbMpns = await MPN.find({ mpnCode: { $in: createdMpnCodes } })
      .populate('materialId', 'name code')
      .populate('vendorId', 'name company gstin');

    console.log(`Found ${dbMpns.length} created MPN records in database.`);

    dbMpns.forEach((mpn, idx) => {
      console.log(`\n  MPN #${idx + 1}:`);
      console.log(`    - Code: ${mpn.mpnCode}`);
      console.log(`    - Part Number: ${mpn.manufacturerPartNumber}`);
      console.log(`    - MPN Name: ${mpn.mpnName}`);
      console.log(`    - Manufacturer Name: ${mpn.manufacturerName}`);
      console.log(`    - Linked Material: ${mpn.materialId?.name} (${mpn.materialId?.code})`);
      console.log(`    - Linked Vendor: ${mpn.vendorId?.name} (${mpn.vendorId?.company})`);
      console.log(`    - Price: ₹${mpn.price}`);
      console.log(`    - MOQ: ${mpn.moq}`);
      console.log(`    - Description: ${mpn.partDescription}`);
      console.log(`    - Status: ${mpn.status}`);
    });

    if (dbMpns.length === 5 && responseData.count === 5) {
      console.log('\n==================== 5 MATERIAL, 5 VENDOR, 5 MPN BULK TEST PASSED 100% ====================');
    } else {
      console.error('\n❌ Test failed. Expected 5 successful MPN records in database.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during 555 bulk test execution:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run555Test();
