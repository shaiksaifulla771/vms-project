const http = require('http');
const mongoose = require('mongoose');

async function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        let bodyJson = null;
        try {
          bodyJson = JSON.parse(bodyBuffer.toString('utf8'));
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          bodyBuffer,
          bodyJson,
          bodyText: bodyBuffer.toString('utf8')
        });
      });
    });
    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSequenceFixTest() {
  console.log("==================== SEQUENCE PEEK FIX AUDIT ====================");
  const createdMaterialIds = [];
  const createdMpnIds = [];

  try {
    // 1. Login to get token
    const loginRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ email: 'admin@vms.com', password: 'admin123' }));

    const token = loginRes.bodyJson.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // --- MATERIAL MASTER SEQUENCE PEEK FIX TEST ---
    console.log("\n--- TEST 1: Material Master Sequence Peek (Soft-Deleted Code Resilience) ---");
    const matPeek1 = await request({ hostname: 'localhost', port: 5000, path: '/api/materials/sequence-peek', method: 'GET', headers: authHeaders });
    const initialMatCode = matPeek1.bodyJson.nextCode;
    console.log("Initial Material Next Code:", initialMatCode);

    // Create a material with initialMatCode
    const matCreate1 = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      name: "Sequence Test Material",
      code: initialMatCode,
      unit: "pcs",
      type: "Raw Material"
    }));

    const mat1Id = matCreate1.bodyJson.data._id;
    createdMaterialIds.push(mat1Id);
    console.log(`Created Material (${initialMatCode}) HTTP Status: ${matCreate1.statusCode}`);

    // Soft-delete this material
    const matDel1 = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/materials/${mat1Id}`,
      method: 'DELETE',
      headers: authHeaders
    });
    console.log(`Soft-Deleted Material (${initialMatCode}) Status: ${matDel1.statusCode}`);

    // Peek sequence again — MUST NOT return initialMatCode, must return next higher code!
    const matPeek2 = await request({ hostname: 'localhost', port: 5000, path: '/api/materials/sequence-peek', method: 'GET', headers: authHeaders });
    const postMatCode = matPeek2.bodyJson.nextCode;
    console.log("Post-Delete Material Next Code:", postMatCode);

    const matInitialNum = parseInt(initialMatCode.substring(1), 10);
    const matPostNum = parseInt(postMatCode.substring(1), 10);

    if (matPostNum === matInitialNum + 1) {
      console.log(`PASS: Material sequence-peek correctly skipped soft-deleted '${initialMatCode}' and returned higher code '${postMatCode}'!`);
    } else {
      console.error(`FAIL: Material sequence collision! Expected 'M${matInitialNum + 1}', got '${postMatCode}'`);
      process.exit(1);
    }

    // Create a new Material using auto-suggested code (postMatCode) without duplicate error
    const matCreate2 = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      name: "Auto Material",
      code: postMatCode,
      unit: "kg",
      type: "Raw Material"
    }));

    if (matCreate2.statusCode === 201) {
      createdMaterialIds.push(matCreate2.bodyJson.data._id);
      console.log(`PASS: Created new Material (${postMatCode}) cleanly with HTTP 201 without duplicate key error!`);
    } else {
      console.error("FAIL: Material creation failed:", matCreate2.bodyText);
      process.exit(1);
    }

    // --- MPN MASTER SEQUENCE PEEK FIX TEST ---
    console.log("\n--- TEST 2: MPN Master Sequence Peek (Soft-Deleted Code Resilience) ---");
    const mpnPeek1 = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/sequence-peek', method: 'GET', headers: authHeaders });
    const initialMpnCode = mpnPeek1.bodyJson.nextCode;
    console.log("Initial MPN Next Code:", initialMpnCode);

    // Fetch material and vendor for MPN creation
    const matRes = await request({ hostname: 'localhost', port: 5000, path: '/api/materials', method: 'GET', headers: authHeaders });
    const venRes = await request({ hostname: 'localhost', port: 5000, path: '/api/vendors', method: 'GET', headers: authHeaders });
    const materialId = matRes.bodyJson.data[0]._id;
    const vendorId = venRes.bodyJson.data[0]._id;

    // Create MPN with initialMpnCode
    const mpnCreate1 = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/mpns',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      mpnCode: initialMpnCode,
      mpnName: "Sequence Test MPN",
      manufacturerPartNumber: `SEQ-${Date.now()}`,
      manufacturerName: "TEST MFG",
      materialId,
      vendorId,
      unitPrice: 500,
      moq: 1,
      uom: "pcs",
      gst: 18,
      status: "Active"
    }));

    const mpn1Id = mpnCreate1.bodyJson.data._id;
    createdMpnIds.push(mpn1Id);
    console.log(`Created MPN (${initialMpnCode}) HTTP Status: ${mpnCreate1.statusCode}`);

    // Soft-delete this MPN
    const mpnDel1 = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/mpns/${mpn1Id}`,
      method: 'DELETE',
      headers: authHeaders
    });
    console.log(`Soft-Deleted MPN (${initialMpnCode}) Status: ${mpnDel1.statusCode}`);

    // Peek sequence again — MUST NOT return initialMpnCode, must return next higher code!
    const mpnPeek2 = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/sequence-peek', method: 'GET', headers: authHeaders });
    const postMpnCode = mpnPeek2.bodyJson.nextCode;
    console.log("Post-Delete MPN Next Code:", postMpnCode);

    const mpnInitialNum = parseInt(initialMpnCode.substring(3), 10);
    const mpnPostNum = parseInt(postMpnCode.substring(3), 10);

    if (mpnPostNum === mpnInitialNum + 1) {
      console.log(`PASS: MPN sequence-peek correctly skipped soft-deleted '${initialMpnCode}' and returned higher code '${postMpnCode}'!`);
    } else {
      console.error(`FAIL: MPN sequence collision! Expected 'MPN${mpnInitialNum + 1}', got '${postMpnCode}'`);
      process.exit(1);
    }

    // Create a new MPN auto-generating code without duplicate error
    const mpnCreate2 = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/mpns',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      mpnName: "Auto MPN Record",
      manufacturerPartNumber: `AUTO-${Date.now()}`,
      manufacturerName: "TEST MFG",
      materialId,
      vendorId,
      unitPrice: 250,
      moq: 5,
      uom: "pcs",
      gst: 18,
      status: "Active"
    }));

    if (mpnCreate2.statusCode === 201) {
      createdMpnIds.push(mpnCreate2.bodyJson.data._id);
      console.log(`PASS: Created new MPN (${mpnCreate2.bodyJson.data.mpnCode}) cleanly with HTTP 201 without duplicate key error!`);
    } else {
      console.error("FAIL: MPN auto-generation failed:", mpnCreate2.bodyText);
      process.exit(1);
    }

    console.log("\n==================== SEQUENCE PEEK AUDIT PASSED 100%! ====================");
  } finally {
    console.log("\n--- AUTOMATED TEARDOWN: Hard-deleting test records ---");
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vms';
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    if (createdMaterialIds.length > 0) {
      const matObjs = createdMaterialIds.map(id => new mongoose.Types.ObjectId(id));
      const mDel = await db.collection('materials').deleteMany({ _id: { $in: matObjs } });
      console.log(`Hard-deleted ${mDel.deletedCount} test Material record(s).`);
    }

    if (createdMpnIds.length > 0) {
      const mpnObjs = createdMpnIds.map(id => new mongoose.Types.ObjectId(id));
      const pDel = await db.collection('mpns').deleteMany({ _id: { $in: mpnObjs } });
      console.log(`Hard-deleted ${pDel.deletedCount} test MPN record(s).`);
    }

    await mongoose.disconnect();
    console.log("Teardown complete. Database is 100% clean.");
  }

  process.exit(0);
}

runSequenceFixTest();
