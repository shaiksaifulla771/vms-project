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
  console.log("Connecting to DB & generating auth token...");
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const User = mongoose.model('User', new mongoose.Schema({ username: String, email: String, role: String }));
  const Material = mongoose.model('Material', new mongoose.Schema({ name: String, code: String, type: String, unit: String, status: String }));
  const BOM = mongoose.model('BOM', new mongoose.Schema({ productId: mongoose.Schema.Types.ObjectId, components: Array, status: String }));

  let admin;
  let attempts = 0;
  while (attempts < 10) {
    admin = await User.findOne({ role: 'Admin' });
    if (admin) break;
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  if (!admin) {
    console.error("FAIL: Admin user not found in verify_bom_phase1.js. Ensure seeding is complete.");
    process.exit(1);
  }
  const token = jwt.sign({ id: admin._id }, getJwtSecret(), { expiresIn: '30d' });
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log("\n==================== ITEM 1: Real Multi-Level Cycle Detection ====================");
  const ts = Date.now();
  const matA = await Material.create({ name: 'Cycle Test Semi-Finished A', code: `MAT-CYC-A-${ts}`, type: 'Semi-Finished', unit: 'kg', status: 'Active' });
  const matB = await Material.create({ name: 'Cycle Test Semi-Finished B', code: `MAT-CYC-B-${ts}`, type: 'Semi-Finished', unit: 'kg', status: 'Active' });
  const matC = await Material.create({ name: 'Cycle Test Semi-Finished C', code: `MAT-CYC-C-${ts}`, type: 'Semi-Finished', unit: 'kg', status: 'Active' });
  const matD = await Material.create({ name: 'Cycle Test Raw D', code: `MAT-CYC-D-${ts}`, type: 'Raw', unit: 'kg', status: 'Active' });

  // 1a. Create BOM: A -> B
  const bomA = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matA._id,
    components: [{ materialId: matB._id, quantity: 1 }]
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
    components: [{ materialId: matC._id, quantity: 1 }]
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
    components: [{ materialId: matA._id, quantity: 1 }]
  }));
  console.log("\n--- 1c. Cycle Rejection Response (C -> A) ---");
  console.log(`HTTP/1.1 ${bomCycle.statusCode}`);
  console.log("Body:", bomCycle.body);

  // 1d. Control Test: Create valid BOM: C -> D
  const bomControl = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/boms',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    productId: matC._id,
    components: [{ materialId: matD._id, quantity: 1 }]
  }));
  console.log("\n--- 1d. Control Test (Valid BOM C -> D) ---");
  console.log(`HTTP/1.1 ${bomControl.statusCode}`);
  console.log("Body snippet:", bomControl.body.substring(0, 200));

  console.log("\n==================== ITEM 2: Soft Delete for BOM ====================");
  const parsedControl = JSON.parse(bomControl.body);
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
    components: [
      { materialId: matD._id, quantity: 5 },
      { materialId: matD._id, quantity: 10 }
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
    components: [
      { materialId: matD._id, quantity: 5 },
      { materialId: fakeId, quantity: 2 }
    ]
  }));
  console.log("--- 4a. Missing Material Response ---");
  console.log(`HTTP/1.1 ${missingRes.statusCode}`);
  console.log("Body:", missingRes.body);

  // Clean up test materials & test BOMs created
  await BOM.deleteMany({ _id: { $in: [JSON.parse(bomA.body).data._id, JSON.parse(bomB.body).data._id, createdBomId] } });
  await Material.deleteMany({ _id: { $in: [matA._id, matB._id, matC._id, matD._id, matDup._id, matBatch._id] } });

  await mongoose.disconnect();
  process.exit(0);
}

runPhase1Verification();
