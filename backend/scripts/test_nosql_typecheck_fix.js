const http = require('http');

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

async function runFollowUpTests() {
  console.log("==================== NOSQL TYPE-CHECK FIX AUDIT ====================");

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

  // Fetch material & vendor
  const matRes = await request({ hostname: 'localhost', port: 5000, path: '/api/materials', method: 'GET', headers: authHeaders });
  const venRes = await request({ hostname: 'localhost', port: 5000, path: '/api/vendors', method: 'GET', headers: authHeaders });
  const materialId = matRes.bodyJson.data[0]._id;
  const vendorId = venRes.bodyJson.data[0]._id;

  const basePayload = {
    mpnName: "Standard Part",
    manufacturerPartNumber: "STD-100",
    manufacturerName: "SKF",
    materialId,
    vendorId,
    unitPrice: 100,
    moq: 1,
    uom: "pcs",
    gst: 18,
    status: "Active"
  };

  // Test 1: manufacturerName object injection
  console.log("\n--- TEST 1: manufacturerName NoSQL Object Injection ---");
  const p1 = { ...basePayload, manufacturerName: { "$ne": null } };
  const res1 = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers: authHeaders }, JSON.stringify(p1));
  console.log(`HTTP Status: ${res1.statusCode} | Error: ${res1.bodyJson?.error}`);

  // Test 2: mpnName object injection
  console.log("\n--- TEST 2: mpnName NoSQL Object Injection ---");
  const p2 = { ...basePayload, mpnName: { "$gt": "" } };
  const res2 = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers: authHeaders }, JSON.stringify(p2));
  console.log(`HTTP Status: ${res2.statusCode} | Error: ${res2.bodyJson?.error}`);

  // Test 3: manufacturerPartNumber object injection
  console.log("\n--- TEST 3: manufacturerPartNumber NoSQL Object Injection ---");
  const p3 = { ...basePayload, manufacturerPartNumber: { "$regex": ".*" } };
  const res3 = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers: authHeaders }, JSON.stringify(p3));
  console.log(`HTTP Status: ${res3.statusCode} | Error: ${res3.bodyJson?.error}`);

  // Test 4: uom object injection
  console.log("\n--- TEST 4: uom NoSQL Object Injection ---");
  const p4 = { ...basePayload, uom: { "$exists": true } };
  const res4 = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers: authHeaders }, JSON.stringify(p4));
  console.log(`HTTP Status: ${res4.statusCode} | Error: ${res4.bodyJson?.error}`);

  const allPassed = res1.statusCode === 400 && res2.statusCode === 400 && res3.statusCode === 400 && res4.statusCode === 400;

  if (allPassed) {
    console.log("\nPASS: All 4 NoSQL object-injection payloads were caught by server-side type guards and returned clean HTTP 400 validation responses.");
  } else {
    console.error("\nFAIL: One or more object injection payloads threw unhandled exceptions!");
    process.exit(1);
  }

  process.exit(0);
}

runFollowUpTests();
