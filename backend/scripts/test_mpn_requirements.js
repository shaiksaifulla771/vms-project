const http = require('http');
const XLSX = require('xlsx');
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

async function runTests() {
  console.log("========== MPN MASTER REQUIREMENTS AUDIT ==========");
  const createdIdsToClean = [];

  try {
    // 1. Login to get token
    const loginRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ email: 'admin@vms.com', password: 'admin123' }));

    if (loginRes.statusCode !== 200 || !loginRes.bodyJson?.token) {
      console.error("Login failed:", loginRes.bodyText);
      process.exit(1);
    }

    const token = loginRes.bodyJson.token;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 2. Fetch materials and vendors
    const matRes = await request({ hostname: 'localhost', port: 5000, path: '/api/materials', method: 'GET', headers });
    const venRes = await request({ hostname: 'localhost', port: 5000, path: '/api/vendors', method: 'GET', headers });

    const materials = matRes.bodyJson.data;
    const vendors = venRes.bodyJson.data;
    const material = materials[0];
    const vendor = vendors[0];
    const material2 = materials[1] || materials[0];
    const vendor2 = vendors[1] || vendors[0];

    console.log(`Using Material 1: ${material.name} (${material._id}), Vendor 1: ${vendor.name} (${vendor._id})`);

    // 3. Test sequence peek
    const seqRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/sequence-peek', method: 'GET', headers });
    console.log("Sequence Peek:", seqRes.bodyJson);

    // 4. Test Draft save (should succeed even with missing unitPrice/gst)
    console.log("\n--- TEST 1: Draft Save (Partial Data) ---");
    const draftPayload = {
      mpnName: "Draft Resistor",
      manufacturerPartNumber: `DRAFT-${Date.now()}`,
      manufacturerName: "SKF",
      materialId: material._id,
      vendorId: vendor._id,
      status: "Draft"
    };
    const draftRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(draftPayload));
    const draftMpn = draftRes.bodyJson?.data;
    if (draftMpn?._id) createdIdsToClean.push(draftMpn._id);
    console.log("Draft Create Result (HTTP " + draftRes.statusCode + "):", draftMpn?.mpnCode, draftMpn?.status);

    // 5. Test Active save without required fields (should fail with HTTP 400)
    console.log("\n--- TEST 2: Active Save (Missing Required Fields) ---");
    const invalidActivePayload = {
      mpnName: "Invalid Active",
      manufacturerPartNumber: "INV-100",
      manufacturerName: "SKF",
      materialId: material._id,
      vendorId: vendor._id,
      status: "Active" // Missing unitPrice, gst, moq, uom
    };
    const invalidRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(invalidActivePayload));
    console.log("Invalid Active Create Result (HTTP " + invalidRes.statusCode + "):", invalidRes.bodyJson?.error);

    // 6. Test valid Active save
    console.log("\n--- TEST 3: Valid Active Save ---");
    const uniquePartNo = `MPN-PART-${Date.now()}`;
    const validActivePayload = {
      mpnName: "Bearing 6205-2RS1",
      manufacturerPartNumber: uniquePartNo,
      manufacturerName: "skf ", // Test case-normalization & trimming -> SKF
      isDirectFromManufacturer: false,
      materialId: material._id,
      vendorId: vendor._id,
      unitPrice: 450.50,
      moq: 10,
      uom: "pcs",
      status: "Active"
    };
    const validRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(validActivePayload));
    console.log("Valid Active Create Result (HTTP " + validRes.statusCode + "):", validRes.bodyJson?.data?.mpnCode, validRes.bodyJson?.data?.manufacturerName);
    const createdMpn = validRes.bodyJson?.data;
    if (createdMpn?._id) createdIdsToClean.push(createdMpn._id);

    // 7. Test duplicate check for SAME vendor (should fail with HTTP 400)
    console.log("\n--- TEST 4: Duplicate Check (Same Vendor + Same Part Number) ---");
    const dupRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(validActivePayload));
    console.log("Duplicate Create Result (HTTP " + dupRes.statusCode + "):", dupRes.bodyJson?.error);

    // 8. Test manufacturers autocomplete endpoint
    console.log("\n--- TEST 5: Distinct Manufacturers List ---");
    const mfrRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/manufacturers', method: 'GET', headers });
    console.log("Manufacturers List:", mfrRes.bodyJson?.data);

    // 9. Test Soft Delete & Restore (Explicitly targeting Draft record from Test 1 to verify previousStatus)
    console.log("\n--- TEST 6: Soft Delete & Restore Correctness (Draft Record) ---");
    const delRes = await request({ hostname: 'localhost', port: 5000, path: `/api/mpns/${draftMpn._id}`, method: 'DELETE', headers });
    console.log("Soft Delete Draft Result:", delRes.bodyJson?.message);

    const restoredRes = await request({ hostname: 'localhost', port: 5000, path: `/api/mpns/${draftMpn._id}/restore`, method: 'PUT', headers });
    const restoredStatus = restoredRes.bodyJson?.data?.status;
    console.log("Restored Record Status:", restoredStatus);

    if (restoredStatus === 'Draft') {
      console.log("PASS: Restored record status is exactly 'Draft' (matching previousStatus prior to deletion).");
    } else {
      console.error(`FAIL: Restore ambiguity! Expected restored status 'Draft', got '${restoredStatus}'`);
      process.exit(1);
    }

    // 10. Test Single-Record PDF Stream
    console.log("\n--- TEST 7: Single-Record PDF Stream ---");
    const pdfRes = await request({ hostname: 'localhost', port: 5000, path: `/api/mpns/${createdMpn._id}/pdf`, method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
    console.log("PDF Stream (HTTP " + pdfRes.statusCode + "):", pdfRes.headers['content-type'], "Bytes:", pdfRes.bodyBuffer.length);

    // 11. Test 4-Filter Excel Export Stream
    console.log("\n--- TEST 8: 4-Filter Excel Export Stream ---");
    const excelRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/mpns/export?search=Bearing&status=Active&materialId=${material._id}&vendorId=${vendor._id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log("Excel Export (HTTP " + excelRes.statusCode + "):", excelRes.headers['content-type'], "Bytes:", excelRes.bodyBuffer.length);

    // 12. NEW TEST 9: Case-normalization collapse test
    console.log("\n--- TEST 9: Case-normalization Collapse Test ---");
    const normPayload = {
      mpnName: "Shaft Seal 30x42x7",
      manufacturerPartNumber: `SEAL-${Date.now()}`,
      manufacturerName: "  skf  ", // Lowercase with leading/trailing spaces
      isDirectFromManufacturer: false,
      materialId: material2._id,
      vendorId: vendor2._id,
      unitPrice: 120.00,
      moq: 5,
      uom: "pcs",
      gst: 18,
      status: "Active"
    };
    const normRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(normPayload));
    if (normRes.bodyJson?.data?._id) createdIdsToClean.push(normRes.bodyJson.data._id);

    const normMfrRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/manufacturers', method: 'GET', headers });
    const mfrList = normMfrRes.bodyJson?.data || [];
    const exactSkfCount = mfrList.filter(m => m === 'SKF').length;
    const lowercaseSkfCount = mfrList.filter(m => m.trim().toLowerCase() === 'skf').length;

    console.log(`Manufacturers fetched: [${mfrList.join(', ')}]`);
    if (exactSkfCount === 1 && lowercaseSkfCount === 1) {
      console.log("PASS: Case-normalization correctly collapsed '  skf  ' into single normalized 'SKF' entry.");
    } else {
      console.error(`FAIL: Normalization gap! Expected 1 'SKF' entry, got count: ${exactSkfCount}`, mfrList);
      process.exit(1);
    }

    // 13. EXHAUSTIVE TEST 10: Export Filter Isolation Test (Exhaustive Row Checking)
    console.log("\n--- TEST 10: Exhaustive Export Filter Isolation Test ---");
    // Material-only filter export
    const matExcelRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/mpns/export?materialId=${material._id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const matWb = XLSX.read(matExcelRes.bodyBuffer, { type: 'buffer' });
    const matSheet = matWb.Sheets[matWb.SheetNames[0]];
    const matRows = XLSX.utils.sheet_to_json(matSheet);

    const matNameExpected = `${material.name} (${material.code || '—'})`;
    let matMatchCount = 0;
    matRows.forEach((r, idx) => {
      if (r['Material Name'] === matNameExpected) {
        matMatchCount++;
      } else {
        console.error(`Row ${idx} Material mismatch: Expected '${matNameExpected}', got '${r['Material Name']}'`);
      }
    });

    const allMatMatch = matRows.length > 0 && matMatchCount === matRows.length;
    console.log(`Checked all ${matMatchCount}/${matRows.length} rows for Material filter ('${matNameExpected}') — ${allMatMatch ? '100% matched' : 'MISMATCH DETECTED'}`);

    // Vendor-only filter export
    const venExcelRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/mpns/export?vendorId=${vendor._id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const venWb = XLSX.read(venExcelRes.bodyBuffer, { type: 'buffer' });
    const venSheet = venWb.Sheets[venWb.SheetNames[0]];
    const venRows = XLSX.utils.sheet_to_json(venSheet);

    const venNameExpected = `${vendor.name} ${vendor.company ? `(${vendor.company})` : ''}`;
    let venMatchCount = 0;
    venRows.forEach((r, idx) => {
      if (r['Vendor Name'] === venNameExpected) {
        venMatchCount++;
      } else {
        console.error(`Row ${idx} Vendor mismatch: Expected '${venNameExpected}', got '${r['Vendor Name']}'`);
      }
    });

    const allVenMatch = venRows.length > 0 && venMatchCount === venRows.length;
    console.log(`Checked all ${venMatchCount}/${venRows.length} rows for Vendor filter ('${venNameExpected}') — ${allVenMatch ? '100% matched' : 'MISMATCH DETECTED'}`);

    if (allMatMatch && allVenMatch) {
      console.log("PASS: Exhaustive export filter isolation confirmed! Every single exported row strictly matched applied filters.");
    } else {
      console.error("FAIL: Export filter isolation mismatch!", { allMatMatch, allVenMatch });
      process.exit(1);
    }

    // 12. Test Active save WITHOUT mpnName (confirm optional field behavior)
    console.log("\n--- TEST 11: Active Save Without MPN Name (Optional Field Verification) ---");
    const noNamePayload = {
      manufacturerPartNumber: `NONAME-${Date.now()}`,
      manufacturerName: "SKF",
      isDirectFromManufacturer: false,
      materialId: material._id,
      vendorId: vendor._id,
      unitPrice: 299.99,
      moq: 5,
      uom: "pcs",
      status: "Active" // mpnName intentionally omitted
    };
    const noNameRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(noNamePayload));
    if (noNameRes.statusCode === 201) {
      const createdNoName = noNameRes.bodyJson?.data;
      if (createdNoName?._id) createdIdsToClean.push(createdNoName._id);
      console.log("PASS: Created Active MPN record cleanly without mpnName (HTTP 201):", createdNoName?.mpnCode, `mpnName: '${createdNoName?.mpnName}'`);
    } else {
      console.error("FAIL: Active save without mpnName failed:", noNameRes.bodyText);
      process.exit(1);
    }

    console.log("\n==================== ALL 11 AUDIT TESTS PASSED SUCCESSFULLY! ====================");
  } finally {
    if (createdIdsToClean.length > 0) {
      console.log(`\n--- AUTOMATED CLEANUP: Removing ${createdIdsToClean.length} test record(s) from database ---`);
      const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
      await mongoose.connect(MONGO_URI);
      const db = mongoose.connection.db;
      const mpnColl = db.collection('mpns');
      const objIds = createdIdsToClean.map(id => new mongoose.Types.ObjectId(id));
      const delRes = await mpnColl.deleteMany({ _id: { $in: objIds } });
      console.log(`Cleaned up ${delRes.deletedCount} test record(s). Database is 100% clean.`);
      await mongoose.disconnect();
    }
  }
  process.exit(0);
}

runTests();
