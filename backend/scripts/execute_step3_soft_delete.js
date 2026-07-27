const mongoose = require('mongoose');

async function executeStep3SoftDelete() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const Sequence = mongoose.model('Sequence', new mongoose.Schema({
    name: String,
    seq: Number
  }));

  const res = await Sequence.updateOne(
    { name: /materialCode/i },
    { $set: { seq: 1032 } }
  );

  console.log(`Sequence update result: ${res.modifiedCount} updated.`);

  const updatedSeq = await Sequence.find({}).lean();
  console.log("Current Sequence collection state:", updatedSeq);

  await mongoose.disconnect();
}

executeStep3SoftDelete();
