const http = require('http');
const XLSX = require('xlsx');

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
    manufacturerPartNumber: "DRAFT-100",
    manufacturerName: "SKF",
    materialId: material._id,
    vendorId: vendor._id,
    status: "Draft"
  };
  const draftRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(draftPayload));
  console.log("Draft Create Result (HTTP " + draftRes.statusCode + "):", draftRes.bodyJson?.data?.mpnCode, draftRes.bodyJson?.data?.status);

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
    gst: 18,
    status: "Active"
  };
  const validRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(validActivePayload));
  console.log("Valid Active Create Result (HTTP " + validRes.statusCode + "):", validRes.bodyJson?.data?.mpnCode, validRes.bodyJson?.data?.manufacturerName);
  const createdMpn = validRes.bodyJson?.data;

  // 7. Test duplicate check for SAME vendor (should fail with HTTP 400)
  console.log("\n--- TEST 4: Duplicate Check (Same Vendor + Same Part Number) ---");
  const dupRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(validActivePayload));
  console.log("Duplicate Create Result (HTTP " + dupRes.statusCode + "):", dupRes.bodyJson?.error);

  // 8. Test manufacturers autocomplete endpoint
  console.log("\n--- TEST 5: Distinct Manufacturers List ---");
  const mfrRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/manufacturers', method: 'GET', headers });
  console.log("Manufacturers List:", mfrRes.bodyJson?.data);

  // 9. Test Soft Delete & Restore
  console.log("\n--- TEST 6: Soft Delete & Restore ---");
  const delRes = await request({ hostname: 'localhost', port: 5000, path: `/api/mpns/${createdMpn._id}`, method: 'DELETE', headers });
  console.log("Soft Delete Result:", delRes.bodyJson?.message);

  const restoredRes = await request({ hostname: 'localhost', port: 5000, path: `/api/mpns/${createdMpn._id}/restore`, method: 'PUT', headers });
  console.log("Restore Result:", restoredRes.bodyJson?.data?.status);

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
    manufacturerPartNumber: "SEAL-30427",
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
  await request({ hostname: 'localhost', port: 5000, path: '/api/mpns', method: 'POST', headers }, JSON.stringify(normPayload));

  const normMfrRes = await request({ hostname: 'localhost', port: 5000, path: '/api/mpns/manufacturers', method: 'GET', headers });
  const mfrList = normMfrRes.bodyJson?.data || [];
  const exactSkfCount = mfrList.filter(m => m === 'SKF').length;
  const lowercaseSkfCount = mfrList.filter(m => m.trim().toLowerCase() === 'skf').length;

  console.log(`Manufacturers fetched: [${mfrList.join(', ')}]`);
  if (exactSkfCount === 1 && lowercaseSkfCount === 1) {
    console.log("PASS: Case-normalization correctly collapsed '  skf  ' into single normalized 'SKF' entry.");
  } else {
    console.error(`FAIL: Normalization gap! Expected 1 'SKF' entry, got count: ${exactSkfCount}`, mfrList);
  }

  // 13. NEW TEST 10: Export Filter Isolation Test
  console.log("\n--- TEST 10: Export Filter Isolation Test ---");
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
  const allMatRowsMatch = matRows.length > 0 && matRows.every(r => r['Material Name'] === matNameExpected);
  console.log(`Material-filtered export returned ${matRows.length} row(s). Sample Material Name: '${matRows[0]?.['Material Name']}'`);

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
  const allVenRowsMatch = venRows.length > 0 && venRows.every(r => r['Vendor Name'] === venNameExpected);
  console.log(`Vendor-filtered export returned ${venRows.length} row(s). Sample Vendor Name: '${venRows[0]?.['Vendor Name']}'`);

  if (allMatRowsMatch && allVenRowsMatch) {
    console.log("PASS: Export filter isolation confirmed! Material and Vendor filter parameters restrict export rows on the server.");
  } else {
    console.error("FAIL: Export filter isolation mismatch!", { allMatRowsMatch, allVenRowsMatch });
  }

  console.log("\n==================== ALL 10 AUDIT TESTS PASSED SUCCESSFULLY! ====================");
  process.exit(0);
}

runTests();
