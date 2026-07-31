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

async function runComprehensiveAudit() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const User = mongoose.model('User', new mongoose.Schema({ username: String, email: String, role: String }));
  const Material = mongoose.model('Material', new mongoose.Schema({ name: String, code: String, status: String }));
  const Vendor = mongoose.model('Vendor', new mongoose.Schema({ name: String, vendorId: String, status: String, bankAccountNumber: String, ifscCode: String }));
  const InventoryItem = mongoose.model('InventoryItem', new mongoose.Schema({ materialId: mongoose.Schema.Types.ObjectId, balance: Number }));

  const admin = await User.findOne({ role: 'Admin' });
  const token = jwt.sign({ id: admin._id }, getJwtSecret(), { expiresIn: '30d' });
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const results = [];
  const ts = Date.now();

  function recordResult(moduleName, featureName, status, httpCode, details) {
    results.push({ moduleName, featureName, status, httpCode, details });
    console.log(`[${status}] ${moduleName} - ${featureName} (HTTP ${httpCode}): ${details}`);
  }

  console.log("==================== AUDITING MATERIAL MASTER MODULE ====================");

  // 1. Material Sequence Peek
  let peekedCode = null;
  try {
    const resPeek = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials/sequence-peek',
      method: 'GET',
      headers: authHeaders
    });
    const parsed = JSON.parse(resPeek.body);
    if (resPeek.statusCode === 200 && parsed.success && parsed.nextCode) {
      peekedCode = parsed.nextCode;
      recordResult('Material Master', '1. Sequence Peek', 'PASS', resPeek.statusCode, `Returned next available code ${parsed.nextCode}`);
    } else {
      recordResult('Material Master', '1. Sequence Peek', 'FAIL', resPeek.statusCode, `Returned code ${parsed ? parsed.nextCode : 'N/A'}`);
    }
  } catch (err) {
    recordResult('Material Master', '1. Sequence Peek', 'FAIL', 500, err.message);
  }

  // 2. Create Active Material
  let testMatId = null;
  const matCodeActive = `M_ACT_${ts}`;
  try {
    const resCreate = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      name: `Audit Material Active ${ts}`,
      code: matCodeActive,
      unit: 'kg',
      type: 'Raw Material',
      subcategory: 'Fresh',
      status: 'Active',
      description: 'Audit test item'
    }));
    const parsed = JSON.parse(resCreate.body);
    if (resCreate.statusCode === 201 && parsed.success && parsed.data._id) {
      testMatId = parsed.data._id;
      recordResult('Material Master', '2. Create Active Material', 'PASS', resCreate.statusCode, `Created ID ${testMatId} with code ${parsed.data.code}`);
    } else {
      recordResult('Material Master', '2. Create Active Material', 'FAIL', resCreate.statusCode, parsed.error || 'Failed');
    }
  } catch (err) {
    recordResult('Material Master', '2. Create Active Material', 'FAIL', 500, err.message);
  }

  // 3. Create Draft Material
  let draftMatId = null;
  const matCodeDraft = `M_DFT_${ts}`;
  try {
    const resDraft = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      name: `Audit Material Draft ${ts}`,
      code: matCodeDraft,
      unit: 'pcs',
      type: 'Finished Goods',
      status: 'Draft',
      description: 'Draft audit item'
    }));
    const parsed = JSON.parse(resDraft.body);
    if (resDraft.statusCode === 201 && parsed.success && parsed.data.status === 'Draft') {
      draftMatId = parsed.data._id;
      recordResult('Material Master', '3. Create Draft Material', 'PASS', resDraft.statusCode, `Created Draft ID ${draftMatId} with status 'Draft'`);
    } else {
      recordResult('Material Master', '3. Create Draft Material', 'FAIL', resDraft.statusCode, parsed.error || 'Failed');
    }
  } catch (err) {
    recordResult('Material Master', '3. Create Draft Material', 'FAIL', 500, err.message);
  }

  // 4. Get Materials List
  try {
    const resList = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials',
      method: 'GET',
      headers: authHeaders
    });
    const parsed = JSON.parse(resList.body);
    if (resList.statusCode === 200 && parsed.success && Array.isArray(parsed.data)) {
      recordResult('Material Master', '4. List Materials', 'PASS', resList.statusCode, `Returned ${parsed.count} non-deleted materials`);
    } else {
      recordResult('Material Master', '4. List Materials', 'FAIL', resList.statusCode, 'Invalid list response');
    }
  } catch (err) {
    recordResult('Material Master', '4. List Materials', 'FAIL', 500, err.message);
  }

  // 5. Get Single Material Detail
  try {
    const resDetail = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/materials/${testMatId}`,
      method: 'GET',
      headers: authHeaders
    });
    const parsed = JSON.parse(resDetail.body);
    if (resDetail.statusCode === 200 && parsed.success && parsed.data._id === testMatId) {
      recordResult('Material Master', '5. Get Single Material Detail', 'PASS', resDetail.statusCode, `Fetched detail for ${parsed.data.name}`);
    } else {
      recordResult('Material Master', '5. Get Single Material Detail', 'FAIL', resDetail.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Material Master', '5. Get Single Material Detail', 'FAIL', 500, err.message);
  }

  // 6. Update Material
  try {
    const resUpdate = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/materials/${testMatId}`,
      method: 'PUT',
      headers: authHeaders
    }, JSON.stringify({
      name: `Audit Material Active ${ts} Updated`,
      unit: 'kg',
      type: 'Raw',
      subcategory: 'Fresh',
      status: 'Active',
      description: 'Updated description'
    }));
    const parsed = JSON.parse(resUpdate.body);
    if (resUpdate.statusCode === 200 && parsed.success && parsed.data.name.includes('Updated')) {
      recordResult('Material Master', '6. Update Material', 'PASS', resUpdate.statusCode, 'Updated material successfully');
    } else {
      recordResult('Material Master', '6. Update Material', 'FAIL', resUpdate.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Material Master', '6. Update Material', 'FAIL', 500, err.message);
  }

  // 7. Single Soft Delete Material
  try {
    const resDel = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/materials/${draftMatId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    const parsed = JSON.parse(resDel.body);
    if (resDel.statusCode === 200 && parsed.success) {
      recordResult('Material Master', '7. Single Soft Delete Material', 'PASS', resDel.statusCode, 'Soft deleted draft material');
    } else {
      recordResult('Material Master', '7. Single Soft Delete Material', 'FAIL', resDel.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Material Master', '7. Single Soft Delete Material', 'FAIL', 500, err.message);
  }

  // 8. Batch Delete Materials
  try {
    const resBatchDel = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/materials/batch-delete',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      ids: [testMatId]
    }));
    const parsed = JSON.parse(resBatchDel.body);
    if (resBatchDel.statusCode === 200 && parsed.success && parsed.count === 1) {
      recordResult('Material Master', '8. Batch Delete Materials', 'PASS', resBatchDel.statusCode, 'Batch deleted 1 material successfully');
    } else {
      recordResult('Material Master', '8. Batch Delete Materials', 'FAIL', resBatchDel.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Material Master', '8. Batch Delete Materials', 'FAIL', 500, err.message);
  }

  console.log("\n==================== AUDITING VENDOR MASTER MODULE ====================");

  // 9. Get Next Vendor Code
  try {
    const resVenCode = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/vendors/sequence-peek',
      method: 'GET',
      headers: authHeaders
    });
    const parsed = JSON.parse(resVenCode.body);
    if (resVenCode.statusCode === 200 && parsed.success && parsed.nextCode) {
      recordResult('Vendor Master', '9. Sequence Peek Vendor Code', 'PASS', resVenCode.statusCode, `Returned next vendor code ${parsed.nextCode}`);
    } else {
      recordResult('Vendor Master', '9. Sequence Peek Vendor Code', 'FAIL', resVenCode.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Vendor Master', '9. Sequence Peek Vendor Code', 'FAIL', 500, err.message);
  }

  // 10. Create Active Vendor
  let testVenId = null;
  try {
    const resCreateVen = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/vendors',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      name: `Audit Vendor Active ${ts}`,
      company: 'Audit Corp',
      email: `audit_vendor_act_${ts}@example.com`,
      phone: '9876543210',
      address: '123 Audit Way',
      city: 'Bangalore',
      state: 'Karnataka',
      country: 'India',
      zipCode: '560001',
      category: 'Raw Material Supplier',
      bankAccountHolder: 'Audit Corp',
      bankAccountNumber: '998877665544',
      bankName: 'HDFC Bank',
      ifscCode: 'HDFC0001234',
      status: 'Active'
    }));
    const parsed = JSON.parse(resCreateVen.body);
    if (resCreateVen.statusCode === 201 && parsed.success && parsed.data._id) {
      testVenId = parsed.data._id;
      recordResult('Vendor Master', '10. Create Active Vendor', 'PASS', resCreateVen.statusCode, `Created Vendor ID ${testVenId} (${parsed.data.vendorId})`);
    } else {
      recordResult('Vendor Master', '10. Create Active Vendor', 'FAIL', resCreateVen.statusCode, parsed.error || 'Failed');
    }
  } catch (err) {
    recordResult('Vendor Master', '10. Create Active Vendor', 'FAIL', 500, err.message);
  }

  // 11. Create Draft Vendor
  let draftVenId = null;
  try {
    const resDraftVen = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/vendors',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      name: `Audit Vendor Draft ${ts}`,
      company: 'Audit Draft Corp',
      email: `audit_vendor_dft_${ts}@example.com`,
      status: 'Draft'
    }));
    const parsed = JSON.parse(resDraftVen.body);
    if (resDraftVen.statusCode === 201 && parsed.success && parsed.data.status === 'Draft') {
      draftVenId = parsed.data._id;
      recordResult('Vendor Master', '11. Create Draft Vendor', 'PASS', resDraftVen.statusCode, `Created Draft Vendor ID ${draftVenId}`);
    } else {
      recordResult('Vendor Master', '11. Create Draft Vendor', 'FAIL', resDraftVen.statusCode, parsed.error || 'Failed');
    }
  } catch (err) {
    recordResult('Vendor Master', '11. Create Draft Vendor', 'FAIL', 500, err.message);
  }

  // 12. List Vendors (Checking Sensitive Field Exclusion)
  try {
    const resVenList = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/vendors?limit=10',
      method: 'GET',
      headers: authHeaders
    });
    const parsed = JSON.parse(resVenList.body);
    const firstVen = parsed.data[0];
    const hasBankingInList = firstVen && (firstVen.bankAccountNumber !== undefined || firstVen.ifscCode !== undefined);

    if (resVenList.statusCode === 200 && parsed.success && !hasBankingInList) {
      recordResult('Vendor Master', '12. List Vendors (Banking Field Projection)', 'PASS', resVenList.statusCode, 'Listed vendors with bankAccountNumber & ifscCode excluded');
    } else {
      recordResult('Vendor Master', '12. List Vendors (Banking Field Projection)', 'FAIL', resVenList.statusCode, 'Banking fields leaked in list');
    }
  } catch (err) {
    recordResult('Vendor Master', '12. List Vendors (Banking Field Projection)', 'FAIL', 500, err.message);
  }

  // 13. Single Vendor Detail (Checking Banking Field Inclusion)
  try {
    const resVenDetail = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/vendors/${testVenId}`,
      method: 'GET',
      headers: authHeaders
    });
    const parsed = JSON.parse(resVenDetail.body);
    const hasBankingInDetail = parsed.data && parsed.data.bankAccountNumber === '998877665544' && parsed.data.ifscCode === 'HDFC0001234';

    if (resVenDetail.statusCode === 200 && parsed.success && hasBankingInDetail) {
      recordResult('Vendor Master', '13. Get Single Vendor Detail', 'PASS', resVenDetail.statusCode, 'Fetched single vendor detail with bankAccountNumber & ifscCode included');
    } else {
      recordResult('Vendor Master', '13. Get Single Vendor Detail', 'FAIL', resVenDetail.statusCode, 'Banking fields missing in detail view');
    }
  } catch (err) {
    recordResult('Vendor Master', '13. Get Single Vendor Detail', 'FAIL', 500, err.message);
  }

  // 14. Update Vendor
  try {
    const resUpdateVen = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/vendors/${testVenId}`,
      method: 'PUT',
      headers: authHeaders
    }, JSON.stringify({
      name: `Audit Vendor Active ${ts} Updated`,
      company: 'Audit Corp Updated',
      email: `audit_vendor_act_${ts}@example.com`,
      status: 'Active'
    }));
    const parsed = JSON.parse(resUpdateVen.body);
    if (resUpdateVen.statusCode === 200 && parsed.success && parsed.data.name.includes('Updated')) {
      recordResult('Vendor Master', '14. Update Vendor', 'PASS', resUpdateVen.statusCode, 'Updated vendor successfully');
    } else {
      recordResult('Vendor Master', '14. Update Vendor', 'FAIL', resUpdateVen.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Vendor Master', '14. Update Vendor', 'FAIL', 500, err.message);
  }

  // 15. Single Soft Delete Vendor
  try {
    const resDelVen = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/vendors/${draftVenId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    const parsed = JSON.parse(resDelVen.body);
    if (resDelVen.statusCode === 200 && parsed.success) {
      recordResult('Vendor Master', '15. Single Soft Delete Vendor', 'PASS', resDelVen.statusCode, 'Soft deleted draft vendor');
    } else {
      recordResult('Vendor Master', '15. Single Soft Delete Vendor', 'FAIL', resDelVen.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Vendor Master', '15. Single Soft Delete Vendor', 'FAIL', 500, err.message);
  }

  // 16. Batch Delete Vendors
  try {
    const resBatchDelVen = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/vendors/batch-delete',
      method: 'POST',
      headers: authHeaders
    }, JSON.stringify({
      ids: [testVenId]
    }));
    const parsed = JSON.parse(resBatchDelVen.body);
    if (resBatchDelVen.statusCode === 200 && parsed.success && parsed.count === 1) {
      recordResult('Vendor Master', '16. Batch Delete Vendors', 'PASS', resBatchDelVen.statusCode, 'Batch deleted 1 vendor successfully');
    } else {
      recordResult('Vendor Master', '16. Batch Delete Vendors', 'FAIL', resBatchDelVen.statusCode, 'Failed');
    }
  } catch (err) {
    recordResult('Vendor Master', '16. Batch Delete Vendors', 'FAIL', 500, err.message);
  }

  // Clean up DB documents created during audit
  await Material.deleteMany({ _id: { $in: [testMatId, draftMatId] } });
  await InventoryItem.deleteMany({ materialId: { $in: [testMatId, draftMatId] } });
  await Vendor.deleteMany({ _id: { $in: [testVenId, draftVenId] } });

  // Reset material sequence back to 1033
  await mongoose.connection.db.collection('sequences').updateMany(
    { $or: [{ name: /materialCode/i }, { _id: 'materialCode' }] },
    { $set: { seq: 1033 } }
  );

  await mongoose.disconnect();
  process.exit(0);
}

runComprehensiveAudit();
