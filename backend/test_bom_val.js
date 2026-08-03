const mongoose = require('mongoose');
const BOM = require('./models/BOM');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test');
  
  try {
    const bom = new BOM({
      productId: new mongoose.Types.ObjectId(),
      batchSize: 10,
      batchUOM: 'kg',
      components: [
        { mpnId: new mongoose.Types.ObjectId(), qty: NaN, lossPercent: 0 }
      ],
      version: 1,
      effectiveDate: new Date(),
      status: 'Active'
    });

    await bom.validate();
    console.log('Validation passed!');
  } catch (err) {
    console.error('Validation failed:', err);
  }

  mongoose.disconnect();
}

test();
