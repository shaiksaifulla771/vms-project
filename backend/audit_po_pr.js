const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '../backend/.env' });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
const API_URL = 'http://localhost:5000';
let token = '';
const results = {};

// Models (Simplified for direct MongoDB querying)
const purchaseSchema = new mongoose.Schema({}, { strict: false, collection: 'purchases' });
const Purchase = mongoose.model('Purchase', purchaseSchema);

const requestSchema = new mongoose.Schema({}, { strict: false, collection: 'purchaserequests' });
const PurchaseRequest = mongoose.model('PurchaseRequest', requestSchema);

const sequenceSchema = new mongoose.Schema({}, { strict: false, collection: 'sequences' });
const Sequence = mongoose.model('Sequence', sequenceSchema);

async function runAudit() {
  console.log('--- STARTING PO/PR AUDIT ---');
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // 1. Get Auth Token
    console.log('\n--- 1. Authentication ---');
    try {
      const authRes = await axios.post(`${API_URL}/api/auth/login`, {
        email: 'admin@vms.com',
        password: 'admin123'
      });
      token = authRes.data.token;
      console.log('Login SUCCESS: Token acquired.');
      results.auth = 'PASS - Login successful';
    } catch (e) {
      console.error('Login failed:', e.message);
      results.auth = 'FAIL - Login failed';
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    // 2. Security: Unauthenticated Access
    console.log('\n--- 2. Security: Unauth Access ---');
    try {
      await axios.get(`${API_URL}/api/purchases`);
      console.log('FAIL: /api/purchases allowed unauthenticated access!');
      results.security_unauth = 'FAIL - Unauthenticated access allowed';
    } catch (e) {
      if (e.response && e.response.status === 401) {
        console.log(`PASS: /api/purchases returned 401: ${JSON.stringify(e.response.data)}`);
        results.security_unauth = `PASS - Returned 401: ${JSON.stringify(e.response.data)}`;
      } else {
        console.log(`WARN: Returned ${e.response?.status} instead of 401`);
        results.security_unauth = `WARN - Returned ${e.response?.status}`;
      }
    }

    // 3. Security: NoSQL Injection (Filter)
    console.log('\n--- 3. Security: NoSQL Injection ---');
    try {
      const noSqlRes = await axios.get(`${API_URL}/api/purchases?status[$ne]=InvalidStatus`, { headers });
      console.log(`Result of NoSQL inject on search: Status ${noSqlRes.status}, returned ${noSqlRes.data.length || 0} items.`);
      results.security_nosql = `Tested status[$ne]. Returned ${noSqlRes.status}, count: ${noSqlRes.data.length || 0}. Code needs review for sanitization if this works.`;
    } catch (e) {
      console.log(`NoSQL inject blocked or failed: ${e.response?.status}`);
      results.security_nosql = `PASS/FAIL - Exception: ${e.response?.status}`;
    }

    // 4. Sequence Counter / Hard Delete Bug Check
    console.log('\n--- 4. Sequence Counter Alignment ---');
    const poSeq = await Sequence.findOne({ name: 'purchase' });
    const highestPO = await Purchase.findOne().sort({ poNumber: -1 });
    
    console.log(`Sequence Collection -> purchase: ${poSeq ? poSeq.value : 'NOT FOUND'}`);
    console.log(`Highest PO in DB: ${highestPO ? highestPO.poNumber : 'NONE'}`);
    
    if (!poSeq) {
      results.sequence = 'FAIL - Sequence document not found for purchase';
    } else if (highestPO) {
      const highestNum = parseInt(highestPO.poNumber.replace('PO-', ''), 10);
      if (poSeq.value >= highestNum) {
         results.sequence = `PASS - Sequence ${poSeq.value} >= Highest PO ${highestNum}`;
      } else {
         results.sequence = `FAIL - Sequence ${poSeq.value} < Highest PO ${highestNum}`;
      }
    } else {
      results.sequence = 'PASS - No POs exist, sequence is ' + poSeq.value;
    }

    // 5. Data Integrity: Duplicate PO Number Scan
    console.log('\n--- 5. Data Integrity: Duplicate POs ---');
    const allPOs = await Purchase.find({}, { poNumber: 1, isDeleted: 1 });
    const poCounts = {};
    const duplicates = [];
    allPOs.forEach(po => {
      if (!po.poNumber) return;
      if (poCounts[po.poNumber]) duplicates.push(po.poNumber);
      poCounts[po.poNumber] = true;
    });
    if (duplicates.length > 0) {
      console.log(`FAIL: Found duplicate PO numbers: ${duplicates.join(', ')}`);
      results.duplicates = `FAIL - Duplicates found: ${duplicates.join(', ')}`;
    } else {
      console.log(`PASS: No duplicate PO numbers across ${allPOs.length} records.`);
      results.duplicates = `PASS - No duplicates in ${allPOs.length} records`;
    }

    // 6. Cross-Module Integration: Orphaned References
    console.log('\n--- 6. Cross-Module: Orphaned References ---');
    // Fetch all materials and vendors first for quick lookup
    const Material = mongoose.model('Material', new mongoose.Schema({}, { strict: false, collection: 'materials' }));
    const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false, collection: 'vendormasters' }));
    
    const allMaterials = await Material.find({}, { _id: 1, isDeleted: 1 });
    const allVendors = await Vendor.find({}, { _id: 1, isDeleted: 1 });
    
    const matMap = new Map(allMaterials.map(m => [m._id.toString(), m.isDeleted]));
    const venMap = new Map(allVendors.map(v => [v._id.toString(), v.isDeleted]));
    
    let orphanedVendors = 0;
    let softDeletedVendors = 0;
    let orphanedMaterials = 0;
    let softDeletedMaterials = 0;

    const fullPOs = await Purchase.find({ isDeleted: { $ne: true } });
    fullPOs.forEach(po => {
      if (po.vendorId) {
        const vId = po.vendorId.toString();
        if (!venMap.has(vId)) orphanedVendors++;
        else if (venMap.get(vId) === true) softDeletedVendors++;
      }
      if (po.materials && Array.isArray(po.materials)) {
        po.materials.forEach(m => {
          if (m.materialId) {
            const mId = m.materialId.toString();
            if (!matMap.has(mId)) orphanedMaterials++;
            else if (matMap.get(mId) === true) softDeletedMaterials++;
          }
        });
      }
    });

    console.log(`Active POs pointing to NON-EXISTENT vendors: ${orphanedVendors}`);
    console.log(`Active POs pointing to SOFT-DELETED vendors: ${softDeletedVendors}`);
    console.log(`Active POs pointing to NON-EXISTENT materials: ${orphanedMaterials}`);
    console.log(`Active POs pointing to SOFT-DELETED materials: ${softDeletedMaterials}`);
    
    results.orphans = {
      orphanedVendors, softDeletedVendors, orphanedMaterials, softDeletedMaterials
    };

    // 7. Extreme/Malformed Input Test
    console.log('\n--- 7. Extreme Input (Validation) ---');
    try {
      const badRes = await axios.post(`${API_URL}/api/purchases`, {
        vendorId: allVendors.length > 0 ? allVendors[0]._id : null,
        materials: [{ materialId: allMaterials.length > 0 ? allMaterials[0]._id : null, quantity: -50, unitPrice: -100 }], // Negative!
        totalAmount: -5000,
        expectedDelivery: 'Not-A-Date'
      }, { headers });
      console.log(`FAIL: Created a malformed PO! Status: ${badRes.status}`);
      results.validation = 'FAIL - Accepted negative quantity/price and invalid date';
    } catch (e) {
      console.log(`PASS: Malformed PO rejected with status: ${e.response?.status}`);
      console.log(`Response: ${JSON.stringify(e.response?.data)}`);
      results.validation = `PASS - Blocked with ${e.response?.status}: ${JSON.stringify(e.response?.data)}`;
    }

    console.log('\n--- AUDIT COMPLETE ---');
    fs.writeFileSync('audit_results_po.json', JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('Fatal Audit Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

runAudit();
