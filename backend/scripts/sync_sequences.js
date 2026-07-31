const mongoose = require('mongoose');

async function syncSequences() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  await mongoose.connection.db.collection('sequences').updateMany(
    { $or: [{ name: /materialCode/i }, { _id: 'materialCode' }] },
    { $set: { seq: 1033 } }
  );

  const seqs = await mongoose.connection.db.collection('sequences').find({}).toArray();
  console.log("Updated Sequences:", seqs);
  await mongoose.disconnect();
}

syncSequences();
