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

async function runEvidenceCollection() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const User = mongoose.model('User', new mongoose.Schema({ username: String, email: String, role: String }));
  const admin = await User.findOne({ role: 'Admin' });
  const token = jwt.sign({ id: admin._id }, getJwtSecret(), { expiresIn: '30d' });
  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  console.log("=== ITEM 3 OUTPUT ===");
  const searchStr = encodeURIComponent('a*b+c(');
  const res3 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/materials?search=${searchStr}`,
    method: 'GET',
    headers: authHeaders
  });
  console.log(`HTTP/1.1 ${res3.statusCode}`);
  console.log("Body:", res3.body);

  console.log("\n=== ITEM 4 OUTPUT ===");
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const corruptedContent = 'not a real spreadsheet file content';
  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="corrupted.xlsx"\r\n`;
  body += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  body += corruptedContent + `\r\n`;
  body += `--${boundary}--\r\n`;

  const res4 = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/materials/batch-upload',
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  console.log(`HTTP/1.1 ${res4.statusCode}`);
  console.log("Body:", res4.body);

  console.log("\n=== ITEM 5 OUTPUT ===");
  const jsonBody = JSON.stringify({ email: { "$gt": "" }, name: "test_nosql_vendor", company: "Test" });
  const res5a = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/vendors',
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonBody)
    }
  }, jsonBody);
  console.log("--- 5a. POST Body Injection ---");
  console.log(`HTTP/1.1 ${res5a.statusCode}`);
  console.log("Body:", res5a.body);

  const res5b = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/vendors?search%5B%24ne%5D=null',
    method: 'GET',
    headers: authHeaders
  });
  console.log("--- 5b. GET Query Injection ---");
  console.log(`HTTP/1.1 ${res5b.statusCode}`);
  console.log("Body:", res5b.body);

  await mongoose.disconnect();
  process.exit(0);
}

runEvidenceCollection();
