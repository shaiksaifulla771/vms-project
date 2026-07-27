const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const getJwtSecret = require('../config/jwt');

async function testProductionBatchUpload() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const User = mongoose.model('User', new mongoose.Schema({ username: String, email: String, role: String }));
  const admin = await User.findOne({ role: 'Admin' });
  const token = jwt.sign({ id: admin._id }, getJwtSecret(), { expiresIn: '30d' });

  // Generate 50 realistic material rows
  const categories = ['Raw Material', 'Packaging', 'Finished Goods'];
  const units = ['kg', 'pcs', 'gm', 'L'];
  const sampleRows = [];

  for (let i = 1; i <= 50; i++) {
    const cat = categories[i % categories.length];
    const uom = units[i % units.length];
    sampleRows.push({
      "Material Name": `Production Sourced Component Grade-${i}`,
      "Material Code": `M50${i < 10 ? '0' + i : i}`,
      "Unit": uom,
      "Category": cat,
      "Sub-Category": cat === 'Raw Material' ? 'Fresh' : cat === 'Packaging' ? 'Retail' : 'Puree',
      "Description": `Automated production test batch item #${i} for manufacturing inventory`,
      "Status": "Active"
    });
  }

  console.log(`Generated ${sampleRows.length} realistic material rows for batch upload test.`);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(wb, ws, "Materials_Batch");
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const boundary = '----WebKitFormBoundaryProductionBatchTest';
  let body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="production_materials_batch_50.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    excelBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/materials/batch-upload',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  };

  const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', async () => {
      console.log(`\nHTTP/1.1 ${res.statusCode} ${res.statusMessage}`);
      console.log("Response Body:", responseData);
      await mongoose.disconnect();
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error("Batch upload failed:", err);
    process.exit(1);
  });

  req.write(body);
  req.end();
}

testProductionBatchUpload();
