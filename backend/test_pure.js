const mongoose = require('mongoose');
const BOM = require('./models/BOM');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test_2');
  
  try {
    const bom = new BOM({
      productId: new mongoose.Types.ObjectId(),
      batchSize: 10,
      batchUOM: 'kg',
      components: [
        { mpnId: new mongoose.Types.ObjectId(), qty: 1, lossPercent: 0 }
      ],
      version: 1,
      effectiveDate: new Date(),
      status: 'Active'
    });

    const validationError = bom.validateSync();
    if (validationError) {
      console.log("Validation Failed:", validationError.message);
    } else {
      console.log("Validation Passed!");
    }
  } catch (err) {
    console.error("Error:", err);
  }
  
  await mongoose.disconnect();
}

run();
