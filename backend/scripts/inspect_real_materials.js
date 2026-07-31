const mongoose = require('mongoose');

async function inspectRealMaterials() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const Material = mongoose.model('Material', new mongoose.Schema({
    name: String,
    code: String,
    status: String,
    createdAt: Date
  }));

  const all = await Material.find({ status: { $ne: 'Deleted' } }).lean();
  
  // Filter out test materials (M5001-M5050, M10000, M10001, MAT-CYC-*, etc.)
  const realMaterials = all.filter(m => 
    !m.name.startsWith('Production Sourced Component') &&
    !m.name.startsWith('Safety Test Material') &&
    !m.name.startsWith('Cycle Test') &&
    !m.name.startsWith('Duplicate Test') &&
    !m.name.startsWith('Batch Test') &&
    !m.code.startsWith('MAT-CYC-') &&
    !m.code.startsWith('MAT-DUP-') &&
    !m.code.startsWith('MAT-BATCH-')
  );

  console.log(`Total active materials in DB: ${all.length}`);
  console.log(`Real non-test materials in DB: ${realMaterials.length}`);

  const numericMCodes = realMaterials
    .filter(m => /^M\d+$/i.test(m.code))
    .map(m => parseInt(m.code.substring(1), 10))
    .sort((a, b) => b - a);

  console.log("Top 10 real numeric M-code numbers:", numericMCodes.slice(0, 10));
  console.log("Highest real numeric M-code:", numericMCodes[0]);

  await mongoose.disconnect();
}

inspectRealMaterials();
