const mongoose = require('mongoose');

async function cleanMpn() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const MPN = require('../models/MPN');
  
  const res = await MPN.deleteMany({});
  console.log("Deleted test MPN records:", res.deletedCount);

  await mongoose.connection.db.collection('sequences').updateMany(
    { $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] },
    { $set: { seq: 1000 } }
  );

  console.log("Reset mpnCode sequence back to 1000");

  await mongoose.disconnect();
}

cleanMpn();
