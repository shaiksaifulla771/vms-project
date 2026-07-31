const http = require('http');

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

async function verifySecurityFortification() {
  console.log("==================== TEST 1: Login Rate Limiter (/api/auth/login) ====================");
  let rateLimited = false;
  for (let i = 1; i <= 12; i++) {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ email: `test_${Date.now()}@vms.com`, password: 'wrongpassword' }));

    console.log(`Attempt ${i}: HTTP ${res.statusCode} — ${res.body.trim()}`);
    if (res.statusCode === 429) {
      rateLimited = true;
      console.log("SUCCESS: loginLimiter successfully triggered HTTP 429 on excessive attempts.");
      break;
    }
  }

  if (!rateLimited) {
    console.log("WARNING: Rate limit was not reached within 12 attempts.");
  }

  process.exit(0);
}

verifySecurityFortification();
