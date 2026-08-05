
const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms');
  const session = await mongoose.startSession();
  const Model = mongoose.model('TestModel', new mongoose.Schema({ name: String }));
  
  console.log('Passing session without startTransaction()');
  await Model.create([{ name: 'test' }], { session });
  console.log('Success without transaction');
  
  try {
    session.startTransaction();
    await Model.create([{ name: 'test2' }], { session });
    await session.commitTransaction();
    console.log('Success with transaction');
  } catch(e) {
    console.error('Transaction error:', e.message);
  }
  
  session.endSession();
  mongoose.disconnect();
}
run();

