const mongoose = require('mongoose');

async function printTop20() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const Material = mongoose.model('Material', new mongoose.Schema({
    name: String,
    code: String,
    createdAt: Date,
    status: String
  }));
  const Sequence = mongoose.model('Sequence', new mongoose.Schema({
    name: String,
    seq: Number
  }));

  const allMaterials = await Material.find({ code: /^M\d+$/i }).lean();
  allMaterials.sort((a, b) => {
    const numA = parseInt(a.code.substring(1), 10);
    const numB = parseInt(b.code.substring(1), 10);
    return numB - numA;
  });

  console.log("=== TOP 20 NUMERIC M-CODES ===");
  allMaterials.slice(0, 20).forEach((m, idx) => {
    console.log(`${idx + 1}. Code: ${m.code} | Name: "${m.name}" | Status: ${m.status || 'Active'} | CreatedAt: ${m.createdAt}`);
  });

  const seq = await Sequence.find({}).lean();
  console.log("\nAll Sequence Documents in DB:", seq);

  await mongoose.disconnect();
}

printTop20();
