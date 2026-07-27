const mongoose = require('mongoose');
const Material = require('../models/Material');
const { createBOM } = require('../controllers/bomController');

async function testQueryCount() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  
  // Enable debug logging
  const queries = [];
  mongoose.set('debug', (collectionName, methodName, ...args) => {
    queries.push({ collectionName, methodName });
    console.log(`MONGOOSE QUERY -> ${collectionName}.${methodName}`);
  });

  const ts = Date.now();
  const prod = await Material.create({ name: 'Batch Query Test Product', code: `MAT-PQ-${ts}`, type: 'Finished', unit: 'pcs', status: 'Active' });
  const comp1 = await Material.create({ name: 'Comp 1', code: `C1-${ts}`, type: 'Raw', unit: 'kg', status: 'Active' });
  const comp2 = await Material.create({ name: 'Comp 2', code: `C2-${ts}`, type: 'Raw', unit: 'kg', status: 'Active' });
  const comp3 = await Material.create({ name: 'Comp 3', code: `C3-${ts}`, type: 'Raw', unit: 'kg', status: 'Active' });
  const comp4 = await Material.create({ name: 'Comp 4', code: `C4-${ts}`, type: 'Raw', unit: 'kg', status: 'Active' });
  const comp5 = await Material.create({ name: 'Comp 5', code: `C5-${ts}`, type: 'Raw', unit: 'kg', status: 'Active' });

  queries.length = 0; // Clear setup queries

  console.log("\n==================== Executing createBOM with 5 components ====================");
  const req = {
    body: {
      productId: prod._id,
      components: [
        { materialId: comp1._id, quantity: 1 },
        { materialId: comp2._id, quantity: 2 },
        { materialId: comp3._id, quantity: 3 },
        { materialId: comp4._id, quantity: 4 },
        { materialId: comp5._id, quantity: 5 }
      ]
    }
  };
  const res = {
    status: (code) => ({
      json: (data) => console.log(`Response Status: ${code}, Data:`, data.success)
    })
  };

  await createBOM(req, res, (err) => console.error(err));

  const materialFindQueries = queries.filter(q => q.collectionName === 'materials' && q.methodName === 'find');
  console.log(`\nSummary: Captured ${materialFindQueries.length} batched 'materials.find' query for component validation (instead of 5 individual findById queries).`);

  // Clean up
  const BOM = mongoose.model('BOM');
  await BOM.deleteMany({ productId: prod._id });
  await Material.deleteMany({ _id: { $in: [prod._id, comp1._id, comp2._id, comp3._id, comp4._id, comp5._id] } });

  await mongoose.disconnect();
  process.exit(0);
}

testQueryCount();
