const mongoose = require('mongoose');

async function cleanM1034() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const Material = mongoose.model('Material', new mongoose.Schema({ name: String, code: String }));
  
  const deletedRes = await Material.deleteMany({ code: { $in: ['M1034', 'M1035'] } });
  console.log("Deleted test items with code M1034/M1035:", deletedRes.deletedCount);

  await mongoose.connection.db.collection('sequences').updateMany(
    { $or: [{ name: /materialCode/i }, { _id: 'materialCode' }] },
    { $set: { seq: 1033 } }
  );

  const seqs = await mongoose.connection.db.collection('sequences').find({}).toArray();
  console.log("Current Sequences in DB:", seqs);

  await mongoose.disconnect();
}

cleanM1034();
