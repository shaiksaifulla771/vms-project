require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const connectDB = require('../config/db');

async function testBomRollupOutputQty() {
  console.log('==================== BOM COST ROLLUP TEST (Output Quantity = 10 kg) ====================\n');

  // Authenticate
  const loginRes = await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let b = '';
        res.on('data', (chunk) => (b += chunk));
        res.on('end', () => resolve(JSON.parse(b)));
      }
    );
    req.write(JSON.stringify({ email: 'admin@vms.com', password: 'admin123' }));
    req.end();
  });

  const token = loginRes.token;
  const authHeaders = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  async function apiCall(method, path, body = null) {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 5000,
          path,
          method,
          headers: authHeaders,
        },
        (res) => {
          let b = '';
          res.on('data', (chunk) => (b += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(b) });
            } catch (e) {
              resolve({ status: res.statusCode, data: b });
            }
          });
        }
      );
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // 1. Create 2 component materials and 1 assembly product
  const comp1 = await apiCall('POST', '/api/materials', { name: 'Rollup Ingredient Alpha', code: `AUDIT-ROLL-A-${Date.now()}`, unit: 'kg', type: 'Raw Material' });
  const comp2 = await apiCall('POST', '/api/materials', { name: 'Rollup Ingredient Beta', code: `AUDIT-ROLL-B-${Date.now()}`, unit: 'kg', type: 'Raw Material' });
  const assy = await apiCall('POST', '/api/materials', { name: 'Batch Output Assembly Product', code: `AUDIT-ROLL-ASSY-${Date.now()}`, unit: 'kg', type: 'Finished' });

  // 2. Add MPN prices for components
  await connectDB();
  const db = mongoose.connection.db;
  let vendorDoc = await db.collection('vendors').findOne({ status: { $ne: 'Deleted' } });
  
  if (!vendorDoc) {
    const v = await apiCall('POST', '/api/vendors', { vendorId: `V-TEST-${Date.now()}`, name: `Rollup Test Vendor ${Date.now()}`, email: `rollup-${Date.now()}@test.com` });
    if (!v.data.data) {
      console.error('Failed to create test vendor:', v.data);
      process.exit(1);
    }
    vendorDoc = { _id: v.data.data._id };
  }

  const mpn1Res = await apiCall('POST', '/api/mpns', {
    materialId: comp1.data.data._id,
    vendorId: vendorDoc._id,
    mpnCode: `MPN-TEST-ALPHA-${Date.now()}`,
    manufacturerPartNumber: `MPN-ALPHA-${Date.now()}`,
    manufacturerName: 'Alpha Mfg',
    mpnName: 'Alpha Powder',
    unitPrice: 20.0, // $20/kg
    moq: 10,
    uom: 'kg',
  });
  if (mpn1Res.status !== 201) console.error('MPN1 Creation failed:', mpn1Res.data);

  const mpn2Res = await apiCall('POST', '/api/mpns', {
    materialId: comp2.data.data._id,
    vendorId: vendorDoc._id,
    mpnCode: `MPN-TEST-BETA-${Date.now()}`,
    manufacturerPartNumber: `MPN-BETA-${Date.now()}`,
    manufacturerName: 'Beta Mfg',
    mpnName: 'Beta Powder',
    unitPrice: 15.0, // $15/kg
    moq: 10,
    uom: 'kg',
  });
  if (mpn2Res.status !== 201) console.error('MPN2 Creation failed:', mpn2Res.data);

  // 3. Create BOM with outputQuantity = 10 kg
  // Uses 5 kg Component 1 ($20/kg = $100) + 10 kg Component 2 ($15/kg = $150)
  // Total Recipe Cost = $100 + $150 = $250.00
  // Output Quantity = 10 kg
  // Calculated Per-Unit Cost = $250 / 10 kg = $25.00 / kg
  const bomCreateRes = await apiCall('POST', '/api/boms', {
    productId: assy.data.data._id,
    batchSize: 10,
    batchUOM: 'kg',
    components: [
      { mpnId: mpn1Res.data.data._id, qty: 5 },
      { mpnId: mpn2Res.data.data._id, qty: 10 },
    ],
  });

  console.log('BOM Creation Response Status:', bomCreateRes.status);
  console.log('BOM Document ID:', bomCreateRes.data.data?._id);

  // Fetch full BOM detail
  const bomReadRes = await apiCall('GET', `/api/boms/${bomCreateRes.data.data._id}`);
  const bomData = bomReadRes.data.data;

  console.log('\n--- COST ROLLUP MATHEMATICAL VERIFICATION ---');
  console.log(`Assembly Product: ${assy.data.data.name} (${assy.data.data.code})`);
  console.log(`Output Quantity Yield: ${bomData.batchSize} ${bomData.batchUOM || 'kg'}`);
  console.log('\nComponents Breakdown:');
  console.log(`1. ${comp1.data.data.name}: 5 kg @ $20.00/kg = $100.00`);
  console.log(`2. ${comp2.data.data.name}: 10 kg @ $15.00/kg = $150.00`);
  console.log('----------------------------------------------------');
  console.log('Total Batch Recipe Cost = $100.00 + $150.00 = $250.00');
  console.log(`Per-Unit Cost Formula   = Total Recipe Cost ÷ Output Quantity`);
  console.log(`                        = $250.00 ÷ 10 kg = $25.00 / kg`);
  console.log('----------------------------------------------------');
  const totalRecipeCost = bomData.liveTotalCost;
  const calculatedUnitCost = totalRecipeCost / bomData.batchSize;

  console.log(`API Calculated Recipe Total Cost : $${totalRecipeCost}`);
  console.log(`API Calculated Per-Unit Cost     : $${calculatedUnitCost} / kg`);

  if (totalRecipeCost !== 250) {
    console.error(`FAIL: Expected Total Cost 250, got ${totalRecipeCost}`);
    process.exit(1);
  }
  if (calculatedUnitCost !== 25) {
    console.error(`FAIL: Expected Unit Cost 25, got ${calculatedUnitCost}`);
    process.exit(1);
  }
  console.log('\n--- MATERIAL TYPE VALIDATION TESTS ---');
  
  // Test 1: Raw Material as Product (Should Fail)
  const invalidProdRes = await apiCall('POST', '/api/boms', {
    productId: comp1.data.data._id, // Raw Material
    batchSize: 10,
    batchUOM: 'kg',
    components: [{ mpnId: mpn2Res.data.data._id, qty: 10 }]
  });
  console.log(`Raw Material as Product Status: ${invalidProdRes.status}`);
  if (invalidProdRes.status !== 400 || !invalidProdRes.data.error.includes('Finished or Semi-Finished')) {
    console.error(`FAIL: Failed to reject Raw Material as Product. Got:`, invalidProdRes.data);
    process.exit(1);
  }

  // Test 2: Finished Goods as Component (Should Fail)
  const assy2 = await apiCall('POST', '/api/materials', { name: 'Batch Output Assembly Product 2', code: `AUDIT-ROLL-ASSY2-${Date.now()}`, unit: 'kg', type: 'Finished' });
  const fgComp = await apiCall('POST', '/api/materials', { name: 'Finished Good Component', code: `AUDIT-ROLL-FGC-${Date.now()}`, unit: 'kg', type: 'Finished' });
  const fgMpnRes = await apiCall('POST', '/api/mpns', {
    materialId: fgComp.data.data._id,
    vendorId: vendorDoc._id,
    mpnCode: `MPN-TEST-FG-${Date.now()}`,
    manufacturerPartNumber: `MPN-FG-${Date.now()}`,
    manufacturerName: 'FG Mfg',
    mpnName: 'FG Product',
    unitPrice: 50.0,
    moq: 1,
    uom: 'kg',
  });

  const invalidCompRes = await apiCall('POST', '/api/boms', {
    productId: assy2.data.data._id,
    batchSize: 10,
    batchUOM: 'kg',
    components: [{ mpnId: fgMpnRes.data.data._id, qty: 10 }] // Using a Finished Good MPN as a component
  });
  console.log(`Finished Good as Component Status: ${invalidCompRes.status}`);
  if (invalidCompRes.status !== 400 || !invalidCompRes.data.error.includes('Finished goods')) {
    console.error(`FAIL: Failed to reject Finished Good as Component. Got:`, invalidCompRes.data);
    process.exit(1);
  }
  
  console.log('PASS: Material Type validation constraints successfully enforced.');

  // Cleanup temporary test items
  await db.collection('boms').deleteOne({ _id: new mongoose.Types.ObjectId(bomCreateRes.data.data._id) });
  await db.collection('mpns').deleteMany({ manufacturerPartNumber: { $regex: /^MPN-(ALPHA|BETA)/ } });
  await db.collection('materials').deleteMany({ code: { $regex: /^AUDIT-ROLL/ } });
  await mongoose.disconnect();

  console.log('\n==================== BOM COST ROLLUP TEST PASSED 100%! ====================');
}

testBomRollupOutputQty();
