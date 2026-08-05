require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const getJwtSecret = require('../config/jwt');

async function runTest() {
  const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(dbUri);
  const db = mongoose.connection.db;
  
  // Find admin user for auth
  const admin = await db.collection('users').findOne({ role: 'Admin' });
  if (!admin) throw new Error('Admin not found');
  
  const token = jwt.sign(
    { id: admin._id },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
  
  const baseURL = 'http://localhost:5000/api';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    console.log('--- TEST ERP TO BOM FLOW ---');
    
    // 1. Create a Material
    const materialData = {
      code: `MAT-${Date.now()}`,
      name: 'Test Premium Component',
      type: 'Raw Material',
      unit: 'pcs',
      status: 'Active'
    };
    
    console.log('1. Creating Material in ERP...');
    const matRes = await fetch(`${baseURL}/materials`, { method: 'POST', headers, body: JSON.stringify(materialData) });
    if (!matRes.ok) throw new Error(await matRes.text());
    const matData = await matRes.json();
    const materialId = matData.data._id;
    console.log(`✅ Material created successfully. ID: ${materialId}`);

    // 2. Create Vendor
    const vendorData = {
      name: `Test Vendor ${Date.now()}`,
      code: `VEND-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      status: 'Active'
    };
    console.log('2. Creating Vendor in ERP...');
    const vendorRes = await fetch(`${baseURL}/vendors`, { method: 'POST', headers, body: JSON.stringify(vendorData) });
    if (!vendorRes.ok) throw new Error(await vendorRes.text());
    const vendorJson = await vendorRes.json();
    const vendorId = vendorJson.data._id;
    console.log(`✅ Vendor created successfully. ID: ${vendorId}`);

    // 3. Create MPN (Needed for BOM components now)
    const mpnData = {
      materialId: materialId,
      vendorId: vendorId,
      mpnCode: `MPN-${Date.now()}`,
      manufacturerPartNumber: 'PN-1234',
      mpnName: 'Test MPN',
      manufacturerName: 'Test Mfg',
      price: 10.50,
      moq: 100,
      leadTime: 7,
      uom: 'pcs'
    };
    console.log('3. Creating MPN...');
    const mpnRes = await fetch(`${baseURL}/mpns`, { method: 'POST', headers, body: JSON.stringify(mpnData) });
    if (!mpnRes.ok) throw new Error(await mpnRes.text());
    const mpnJson = await mpnRes.json();
    const mpnId = mpnJson.data._id;
    console.log(`✅ MPN created. ID: ${mpnId}`);

    // 3. Create a BOM using this Material
    const bomData = {
      productId: materialId,
      bomNumber: `BOM-${Date.now()}`,
      version: '1.0',
      description: 'Test BOM for integration',
      isActive: true,
      batchSize: 100, // required
      batchUOM: 'pcs', // required
      components: [
        {
          materialId: materialId,
          mpnId: mpnId, // required
          qty: 2,
          unitCost: 10.50,
          totalCost: 21.00,
          notes: 'Primary component'
        }
      ],
      laborSteps: [
        {
          stepName: 'Assembly',
          hours: 1,
          hourlyRate: 15,
          totalCost: 15
        }
      ],
      totalComponentCost: 21.00,
      totalLaborCost: 15.00,
      totalCost: 36.00
    };

    console.log('\n4. Creating BOM Recipe using the Material and MPN...');
    const bomRes = await fetch(`${baseURL}/boms`, { method: 'POST', headers, body: JSON.stringify(bomData) });
    if (!bomRes.ok) throw new Error(await bomRes.text());
    const bomJson = await bomRes.json();
    console.log(`✅ BOM created successfully. ID: ${bomJson.data._id}`);
    
    console.log('\n✅ ALL INTEGRATION TESTS PASSED: ERP -> BOM FLOW IS FULLY FUNCTIONAL.');
    
  } catch (error) {
    console.error('❌ TEST FAILED');
    console.error(error.message);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
