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

async function runMpnAudit() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const User = mongoose.model('User', new mongoose.Schema({ username: String, email: String, role: String }));
  const Material = mongoose.model('Material', new mongoose.Schema({ name: String, code: String, status: String }));
  const Vendor = mongoose.model('Vendor', new mongoose.Schema({ name: String, vendorId: String, status: String }));
  const MPN = require('../models/MPN');

  const admin = await User.findOne({ role: 'Admin' });
  const token = jwt.sign({ id: admin._id }, getJwtSecret(), { expiresIn: '30d' });
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const sampleMat = await Material.findOne({ status: { $ne: 'Deleted' } });
  const sampleVen = await Vendor.findOne({ status: { $ne: 'Deleted' } });

  console.log("==================== TEST 1: GET /api/mpns/sequence-peek ====================");
  const peekRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/mpns/sequence-peek',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`HTTP/1.1 ${peekRes.statusCode}`);
  console.log("Peek Response Body:", peekRes.body);

  console.log("\n==================== TEST 2: POST /api/mpns (Create MPN) ====================");
  const createRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/mpns',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    mpnName: 'High-Temp Ceramic Resistor 10k',
    manufacturerName: 'Texas Instruments',
    materialId: sampleMat._id.toString(),
    vendorId: sampleVen._id.toString(),
    partDescription: 'Automotive grade 10k resistor',
    status: 'Active'
  }));
  console.log(`HTTP/1.1 ${createRes.statusCode}`);
  console.log("Create Response Body:", createRes.body);

  const createdMpn = JSON.parse(createRes.body).data;

  console.log("\n==================== TEST 3: GET /api/mpns (List MPNs) ====================");
  const listRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/mpns',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`HTTP/1.1 ${listRes.statusCode}`);
  console.log("List Response Body:", listRes.body);

  console.log("\n==================== TEST 4: PUT /api/mpns/:id (Update MPN) ====================");
  const updateRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/mpns/${createdMpn._id}`,
    method: 'PUT',
    headers: authHeaders
  }, JSON.stringify({
    mpnName: 'High-Temp Ceramic Resistor 10k Updated',
    manufacturerName: 'Texas Instruments',
    status: 'Active'
  }));
  console.log(`HTTP/1.1 ${updateRes.statusCode}`);
  console.log("Update Response Body:", updateRes.body);

  console.log("\n==================== TEST 5: DELETE /api/mpns/:id (Soft Delete MPN) ====================");
  const delRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/mpns/${createdMpn._id}`,
    method: 'DELETE',
    headers: authHeaders
  });
  console.log(`HTTP/1.1 ${delRes.statusCode}`);
  console.log("Delete Response Body:", delRes.body);

  // Clean up DB test record
  await MPN.deleteOne({ _id: createdMpn._id });
  await mongoose.connection.db.collection('sequences').deleteOne({ _id: 'mpnCode' });

  await mongoose.disconnect();
  process.exit(0);
}

runMpnAudit();
