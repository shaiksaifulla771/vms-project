const mongoose = require('mongoose');
const http = require('http');

async function verifyVendorSequenceFix() {
  console.log('==================== VENDOR MASTER AUTO-SEQUENCE FIX VERIFICATION ====================\n');

  // Authenticate
  const loginRes = await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let b = '';
        res.on('data', (chunk) => (b += chunk));
        res.on('end', () => resolve(JSON.parse(b)));
      }
    );
    req.write(JSON.stringify({ email: 'admin@vms.com', password: 'admin123' }));
    req.end();
  });

  const token = loginRes.token;
  const authHeaders = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  async function apiCall(method, path, body = null) {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 5000,
          path,
          method,
          headers: authHeaders,
        },
        (res) => {
          let b = '';
          res.on('data', (chunk) => (b += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(b) });
            } catch (e) {
              resolve({ status: res.statusCode, data: b });
            }
          });
        }
      );
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // 1. Sequence Peek Initial
  const peek1 = await apiCall('GET', '/api/vendors/sequence-peek');
  console.log(`Initial Vendor Sequence Peek: ${peek1.data.nextCode}`);

  // 2. Create Vendor
  const createRes = await apiCall('POST', '/api/vendors', {
    name: 'Sequence Test Vendor Alpha',
    email: `seq.vendor.alpha.${Date.now()}@real.com`,
  });
  console.log(`Created Vendor Response Status: ${createRes.status}, Assigned V-Code: ${createRes.data.data?.vendorId}`);

  // 3. Soft Delete Vendor
  const vendorId = createRes.data.data?._id;
  const deleteRes = await apiCall('DELETE', `/api/vendors/${vendorId}`);
  console.log(`Soft-Deleted Vendor Status: ${deleteRes.status}`);

  // 4. Sequence Peek Post-Delete (Should still return V1048, not jump to V1049)
  const peek2 = await apiCall('GET', '/api/vendors/sequence-peek');
  console.log(`Post-Delete Vendor Sequence Peek: ${peek2.data.nextCode}`);

  // 5. Cleanup test vendor completely
  const mongooseConn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vms');
  const db = mongooseConn.connection.db;
  await db.collection('vendors').deleteOne({ _id: new mongoose.Types.ObjectId(vendorId) });
  await db.collection('sequences').updateOne({ _id: 'vendorCode' }, { $set: { seq: 1047 } });
  await mongoose.disconnect();

  if (peek1.data.nextCode === 'V1048' && peek2.data.nextCode === 'V1048') {
    console.log('\n==================== VENDOR SEQUENCE FIX VERIFIED 100% PASS! ====================');
  } else {
    console.log('\n==================== VENDOR SEQUENCE FIX FAILED ====================');
  }
}

verifyVendorSequenceFix();
