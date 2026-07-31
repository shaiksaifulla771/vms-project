const mongoose = require('mongoose');

async function checkCode1033() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const Material = mongoose.model('Material', new mongoose.Schema({
    name: String,
    code: String,
    status: String
  }));

  const item1033 = await Material.findOne({ code: 'M1033' });
  console.log("Material with code M1033 in DB:", item1033);

  const highestCodeItem = await Material.find({ code: /^M\d+$/i }).lean();
  highestCodeItem.sort((a, b) => parseInt(b.code.substring(1), 10) - parseInt(a.code.substring(1), 10));
  console.log("Top 5 materials with highest M-codes:", highestCodeItem.slice(0, 5).map(m => `${m.code} (${m.name}, status: ${m.status})`));

  await mongoose.disconnect();
}

checkCode1033();
