require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const getJwtSecret = require('../config/jwt');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runPhase1Verification() {
  const connectDB = require('../config/db');
  await connectDB();
  const db = mongoose.connection.db;
  console.log(`Connected to database: ${db.databaseName}`);
  
  const Material = require('../models/Material');
  const BOM = require('../models/BOM');
  const Vendor = require('../models/Vendor');
  const MPN = require('../models/MPN');

  const loginRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ email: 'admin@vms.com', password: 'admin123' }));
  
  if (loginRes.statusCode !== 200) {
    console.error(`FAIL: Login failed with status ${loginRes.statusCode}. Body: ${loginRes.body}`);
    process.exit(1);
  }
  
  const token = JSON.parse(loginRes.body).token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log("\n==================== ITEM 1: Real Multi-Level Cycle Detection ====================");
  const ts = Date.now();
  const matA = await Material.create({ name: 'Cycle Test Semi-Finished A', code: `MAT-CYC-A-${ts}`, type: 'Semi-Finished', unit: 'kg', status: 'Active' });
  const matB = await Material.create({ name: 'Cycle Test Semi-Finished B', code: `MAT-CYC-B-${ts}`, type: 'Semi-Finished', unit: 'kg', status: 'Active' });
  const matC = await Material.create({ name: 'Cycle Test Semi-Finished C', code: `MAT-CYC-C-${ts}`, type: 'Semi-Finished', unit: 'kg', status: 'Active' });
  const matD = await Material.create({ name: 'Cycle Test Raw D', code: `MAT-CYC-D-${ts}`, type: 'Raw Material', unit: 'kg', status: 'Active' });

  const vendor = await Vendor.create({ name: 'Phase 1 Test Vendor', email: 'test@vendor.com', company: 'TestCo', category: 'Raw Materials', status: 'Active' });
  const mpnA = await MPN.create({ materialId: matA._id, vendorId: vendor._id, mpnCode: `MPN-A-${ts}`, manufacturerName: 'Test Mfg', manufacturerPartNumber: `PN-A-${ts}`, price: 10, uom: 'kg', status: 'Active' });
  const mpnB = await MPN.create({ materialId: matB._id, vendorId: vendor._id, mpnCode: `MPN-B-${ts}`, manufacturerName: 'Test Mfg', manufacturerPartNumber: `PN-B-${ts}`, price: 10, uom: 'kg', status: 'Active' });
  const mpnC = await MPN.create({ materialId: matC._id, vendorId: vendor._id, mpnCode: `MPN-C-${ts}`, manufacturerName: 'Test Mfg', manufacturerPartNumber: `PN-C-${ts}`, price: 10, uom: 'kg', status: 'Active' });
  const mpnD = await MPN.create({ materialId: matD._id, vendorId: vendor._id, mpnCode: `MPN-D-${ts}`, manufacturerName: 'Test Mfg', manufacturerPartNumber: `PN-D-${ts}`, price: 10, uom: 'kg', status: 'Active' });

  // 1a. Create BOM: A -> B
  const bomA = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matA._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [{ mpnId: mpnB._id, qty: 1 }]
  }));
  console.log("Create BOM A->B:", bomA.statusCode);

  // 1b. Create BOM: B -> C
  const bomB = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matB._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [{ mpnId: mpnC._id, qty: 1 }]
  }));
  console.log("Create BOM B->C:", bomB.statusCode);

  // 1c. Attempt Cycle BOM: C -> A (completing A -> B -> C -> A)
  const bomCycle = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matC._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [{ mpnId: mpnA._id, qty: 1 }]
  }));
  console.log("\n--- 1c. Cycle Rejection Response (C -> A) ---");
  console.log(`HTTP/1.1 ${bomCycle.statusCode}`);
  console.log("Body:", bomCycle.statusCode === 400 ? bomCycle.body : bomCycle.body);
  
  if (bomCycle.statusCode !== 400) {
    console.error("FAIL: Cycle was not rejected! The server allowed a BOM cycle.");
    process.exit(1);
  }

  // 1c2. Attempt Self-Reference BOM: C -> C (direct self-reference)
  const bomSelfRef = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matC._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [{ mpnId: mpnC._id, qty: 1 }]
  }));
  console.log("\n--- 1c2. Self-Reference Rejection Response (C -> C) ---");
  console.log(`HTTP/1.1 ${bomSelfRef.statusCode}`);
  console.log("Body:", bomSelfRef.statusCode === 400 ? bomSelfRef.body : bomSelfRef.body);

  if (bomSelfRef.statusCode !== 400) {
    console.error("FAIL: Self-reference cycle was not rejected! The server allowed a BOM to reference itself.");
    process.exit(1);
  }

  // 1d. Control Test: Create valid BOM: C -> D
  const bomControl = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matC._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [{ mpnId: mpnD._id, qty: 1 }]
  }));
  console.log("\n--- 1d. Control Test (Valid BOM C -> D) ---");
  console.log(`HTTP/1.1 ${bomControl.statusCode}`);
  console.log("Body snippet:", bomControl.body.substring(0, 200));

  console.log("\n==================== ITEM 2: Soft Delete for BOM ====================");
  const parsedControl = JSON.parse(bomControl.body);
  if (!parsedControl.data || !parsedControl.data._id) {
    console.error(`FAIL: Valid BOM creation returned: ${bomControl.body}`);
    process.exit(1);
  }
  const createdBomId = parsedControl.data._id;

  const deleteRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/boms/${createdBomId}`,
    method: 'DELETE',
    headers: authHeaders
  });
  console.log("--- 2a. DELETE /api/boms/:id ---");
  console.log(`HTTP/1.1 ${deleteRes.statusCode}`);
  console.log("Body:", deleteRes.body);

  const listRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'GET',
    headers: authHeaders
  });
  const parsedList = JSON.parse(listRes.body);
  const foundInList = parsedList.data.some(b => b._id === createdBomId);
  console.log("\n--- 2b. GET /api/boms list check ---");
  console.log(`HTTP/1.1 ${listRes.statusCode}, total active BOMs: ${parsedList.count}, deleted BOM present: ${foundInList}`);

  const singleRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/boms/${createdBomId}`,
    method: 'GET',
    headers: authHeaders
  });
  console.log("\n--- 2c. GET /api/boms/:id single fetch for deleted BOM ---");
  console.log(`HTTP/1.1 ${singleRes.statusCode}`);
  console.log("Body:", singleRes.body);

  const dbDoc = await BOM.findById(createdBomId);
  console.log("\n--- 2d. Direct MongoDB Document Query ---");
  console.log(`Document exists in DB: ${Boolean(dbDoc)}, Status: '${dbDoc ? dbDoc.status : 'N/A'}'`);

  console.log("\n==================== ITEM 3: Reject Duplicate Components ====================");
  const matDup = await Material.create({ name: 'Duplicate Test Finished Product', code: `MAT-DUP-${ts}`, type: 'Finished', unit: 'kg', status: 'Active' });
  const dupRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matDup._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [
      { mpnId: mpnD._id, qty: 5 },
      { mpnId: mpnD._id, qty: 10 }
    ]
  }));
  console.log("--- 3. Duplicate Component Rejection Response ---");
  console.log(`HTTP/1.1 ${dupRes.statusCode}`);
  console.log("Body:", dupRes.body);

  console.log("\n==================== ITEM 4: Batched Component Validation Queries (N+1 Fix) ====================");
  const matBatch = await Material.create({ name: 'Batch Test Finished Product', code: `MAT-BATCH-${ts}`, type: 'Finished', unit: 'kg', status: 'Active' });
  const fakeId = new mongoose.Types.ObjectId().toString();
  const missingRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matBatch._id,
    batchSize: 1,
    batchUOM: 'kg',
    components: [
      { mpnId: mpnD._id, qty: 5 },
      { mpnId: fakeId, qty: 2 }
    ]
  }));
  console.log("--- 4a. Missing Material Response ---");
  console.log(`HTTP/1.1 ${missingRes.statusCode}`);
  console.log("Body:", missingRes.body);

  // Clean up test materials & test BOMs created
  await BOM.deleteMany({ _id: { $in: [JSON.parse(bomA.body).data?._id, JSON.parse(bomB.body).data?._id, createdBomId].filter(Boolean) } });
  await MPN.deleteMany({ _id: { $in: [mpnA._id, mpnB._id, mpnC._id, mpnD._id] } });
  await Vendor.deleteMany({ _id: vendor._id });
  await Material.deleteMany({ _id: { $in: [matA._id, matB._id, matC._id, matD._id, matDup._id, matBatch._id] } });

  await mongoose.disconnect();
  process.exit(0);
}

runPhase1Verification();
