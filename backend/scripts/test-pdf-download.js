const fs = require('fs');
const path = require('path');

async function test() {
  try {
    console.log('1. Attempting login to retrieve authentication token...');
    const loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vms.com', password: 'admin123' })
    });
    
    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed with status ${loginRes.status}: ${errText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('   Login successful. JWT token received.');

    console.log('2. Requesting binary PDF report from /api/reports/pdf...');
    const pdfRes = await fetch('http://127.0.0.1:5000/api/reports/pdf', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('   Response Status:', pdfRes.status);
    console.log('   Response Content-Type:', pdfRes.headers.get('content-type'));
    
    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      throw new Error(`PDF endpoint returned error: ${errText}`);
    }

    const buffer = await pdfRes.arrayBuffer();
    const outPath = path.join(__dirname, '..', 'downloaded_test.pdf');
    fs.writeFileSync(outPath, Buffer.from(buffer));
    
    console.log(`\n✅ PDF saved successfully to: ${outPath}`);
    console.log(`   Final File Size: ${buffer.byteLength} bytes.`);
  } catch (err) {
    console.error('❌ Download test failed:', err.message);
  }
}

test();
