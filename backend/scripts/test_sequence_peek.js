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

async function runSequenceVerification() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const User = mongoose.model('User', new mongoose.Schema({ username: String, email: String, role: String }));
  const Material = mongoose.model('Material', new mongoose.Schema({ name: String, code: String, status: String }));

  const admin = await User.findOne({ role: 'Admin' });
  const token = jwt.sign({ id: admin._id }, getJwtSecret(), { expiresIn: '30d' });
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log("==================== TEST 1: Initial sequence-peek ====================");
  const peek1 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/materials/sequence-peek',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`HTTP/1.1 ${peek1.statusCode}`);
  console.log("Response Body:", peek1.body);

  console.log("\n==================== TEST 2: Create new material using next-code ====================");
  const nextCodeRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/materials/next-code',
    method: 'GET',
    headers: authHeaders
  });
  const parsedCode = JSON.parse(nextCodeRes.body).nextCode;
  console.log("Generated next code via /next-code:", parsedCode);

  const createRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/materials',
    method: 'POST',
    headers: authHeaders
  }, JSON.stringify({
    name: 'Sequential Organic Ingredient Test',
    code: parsedCode,
    unit: 'kg',
    type: 'Raw'
  }));
  console.log(`HTTP/1.1 ${createRes.statusCode}`);
  console.log("Created Material Body:", createRes.body);

  console.log("\n==================== TEST 3: Post-creation sequence-peek ====================");
  const peek2 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/materials/sequence-peek',
    method: 'GET',
    headers: authHeaders
  });
  console.log(`HTTP/1.1 ${peek2.statusCode}`);
  console.log("Response Body:", peek2.body);

  // Clean up created material
  await Material.deleteOne({ code: parsedCode });
  await mongoose.connection.db.collection('sequences').updateMany(
    { $or: [{ name: /materialCode/i }, { _id: 'materialCode' }] },
    { $set: { seq: 1032 } }
  );

  await mongoose.disconnect();
  process.exit(0);
}

runSequenceVerification();
