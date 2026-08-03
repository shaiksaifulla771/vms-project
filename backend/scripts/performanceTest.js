const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const InventoryItem = require('../models/InventoryItem');
const ProductionOrder = require('../models/ProductionOrder');
const InventoryTransaction = require('../models/InventoryTransaction');
const QualityRecord = require('../models/QualityRecord');
const Sequence = require('../models/Sequence');

const BATCH_SIZE = 500;
const TEST_RUN_ID = 'PERF_TEST_RUN';

exports.generatePerformanceData = async (targetCount = 10000) => {
  console.log(`Generating ${targetCount} performance test records...`);
  
  // 1. Setup Base Data
  const srcWH = await Warehouse.findOneAndUpdate({ code: 'PERF-SRC' }, { name: 'Perf Source', isActive: true }, { upsert: true, new: true });
  const dstWH = await Warehouse.findOneAndUpdate({ code: 'PERF-DST' }, { name: 'Perf Dest', isActive: true }, { upsert: true, new: true });

  const rawMat = await Material.findOneAndUpdate({ code: `RM-${TEST_RUN_ID}` }, { name: 'Perf Raw', type: 'Raw Material', unit: 'pcs' }, { upsert: true, new: true });
  const fgMat = await Material.findOneAndUpdate({ code: `FG-${TEST_RUN_ID}` }, { name: 'Perf FG', type: 'Finished Good', unit: 'pcs' }, { upsert: true, new: true });

  const vendor = await Vendor.findOneAndUpdate({ vendorId: `V-${TEST_RUN_ID}` }, { name: 'Perf Vendor', status: 'Active', email: 'perf@test.com' }, { upsert: true, new: true });
  
  const mpn = await MPN.findOneAndUpdate({ mpnCode: `MPN-${TEST_RUN_ID}` }, { 
    materialId: rawMat._id, 
    vendorId: vendor._id,
    vendorPartNumber: 'PERF-PART-1',
    manufacturerName: 'Perf Mfg',
    manufacturerPartNumber: 'PERF-MFG-1',
    price: 10,
    status: 'Active'
  }, { upsert: true, new: true, runValidators: true });

  const bom = await BOM.findOneAndUpdate({ version: 99999 }, {
    productId: fgMat._id,
    batchSize: 1,
    batchUOM: 'pcs',
    version: 99999,
    status: 'Active',
    components: [{ mpnId: mpn._id, qty: 1, lossPercent: 0 }]
  }, { upsert: true, new: true });

  // Update Sequence to not overlap
  let seqDoc = await Sequence.findById('productionOrder');
  const startSeq = seqDoc ? seqDoc.seq + 1 : 1000;
  
  await Sequence.findByIdAndUpdate('productionOrder', { $inc: { seq: targetCount } }, { upsert: true });

  let insertedCount = 0;
  while (insertedCount < targetCount) {
    const ordersToInsert = [];
    for (let i = 0; i < Math.min(BATCH_SIZE, targetCount - insertedCount); i++) {
      const currentSeq = startSeq + insertedCount + i;
      ordersToInsert.push({
        prdNumber: `PRD-${currentSeq}`,
        bomId: bom._id,
        productId: bom.productId,
        sourceWarehouseId: srcWH._id,
        destinationWarehouseId: dstWH._id,
        targetQuantity: 100,
        batchNumber: TEST_RUN_ID,
        status: 'Completed', // Generating them as completed
        components: [{
          mpnId: mpn._id,
          expectedQuantity: 100,
          actualQuantity: 100,
          lossPercent: 0,
          expectedCost: 1000,
          actualCost: 1000
        }],
        expectedCost: 1000,
        actualCost: 1000,
        createdBy: new mongoose.Types.ObjectId(), // Dummy user
        isPerformanceTest: true,
        testRunId: TEST_RUN_ID
      });
    }

    await ProductionOrder.insertMany(ordersToInsert);
    insertedCount += ordersToInsert.length;
    console.log(`Inserted ${insertedCount} / ${targetCount} production orders...`);
  }
  
  console.log('Performance data generation complete.');
};

exports.cleanupPerformanceTestData = async () => {
  console.log('Starting cleanup of performance test data...');
  
  await ProductionOrder.deleteMany({ isPerformanceTest: true });
  
  await InventoryTransaction.deleteMany({ batchNumber: TEST_RUN_ID });
  await InventoryItem.deleteMany({ batchNumber: TEST_RUN_ID });
  
  await BOM.deleteMany({ version: 99999 });
  await MPN.deleteMany({ mpnCode: `MPN-${TEST_RUN_ID}` });
  await Vendor.deleteMany({ vendorId: `V-${TEST_RUN_ID}` });
  await Material.deleteMany({ code: { $in: [`RM-${TEST_RUN_ID}`, `FG-${TEST_RUN_ID}`] } });
  await Warehouse.deleteMany({ code: { $in: ['PERF-SRC', 'PERF-DST'] } });

  // Sequence Reset
  // We need to restore the sequence to the highest non-performance PRD number
  const latestRealOrder = await ProductionOrder.findOne({ isPerformanceTest: false }).sort({ createdAt: -1 });
  if (latestRealOrder) {
    // Assuming PRD-1005 format
    const seqPart = parseInt(latestRealOrder.prdNumber.split('-')[1]);
    if (!isNaN(seqPart)) {
      await Sequence.findByIdAndUpdate('productionOrder', { seq: seqPart });
      console.log(`Sequence reset to ${seqPart}`);
    }
  } else {
    await Sequence.findByIdAndUpdate('productionOrder', { seq: 1000 });
    console.log(`Sequence reset to 1000`);
  }

  console.log('Cleanup complete.');
};

const run = async () => {
  if (process.argv[2] === '--generate') {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
    await exports.generatePerformanceData(10000);
    process.exit(0);
  } else if (process.argv[2] === '--cleanup') {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
    await exports.cleanupPerformanceTestData();
    process.exit(0);
  }
};

if (require.main === module) {
  run();
}
