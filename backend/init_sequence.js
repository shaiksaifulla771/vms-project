const mongoose = require('mongoose');

async function initSequence() {
  await mongoose.connect('mongodb://127.0.0.1/vms');
  console.log("Connected to MongoDB");
  
  const Sequence = require('./models/Sequence');
  const Material = require('./models/Material');
  
  let maxCounter = 1000;
  const lastMat = await Material.findOne().sort({ code: -1 });
  if (lastMat && lastMat.code && lastMat.code.startsWith('M')) {
     const parsed = parseInt(lastMat.code.replace('M', ''), 10);
     if (!isNaN(parsed)) maxCounter = parsed;
  }
  
  await Sequence.findOneAndUpdate(
    { _id: 'materialCode' },
    { $set: { seq: maxCounter } },
    { upsert: true }
  );
  
  console.log(`Initialized Sequence to ${maxCounter}`);
  await mongoose.disconnect();
}

initSequence();
