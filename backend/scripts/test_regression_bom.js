const mongoose = require('mongoose');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');

// Mock request and response
const req = { body: {}, params: {}, user: { name: 'TestUser' }, connection: { remoteAddress: '127.0.0.1' } };
const res = {
  status: function(code) { this.statusCode = code; return this; },
  json: function(data) { this.data = data; return this; }
};
const next = (err) => { if(err) console.error(err); };

const bomController = require('../controllers/bomController');
const { validateBomRecipe } = require('../validators/bomValidator');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms_test_db_bom_api';

async function runApiTest() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  
  const collection = mongoose.connection.db.collection('boms');
  try {
    await collection.dropIndexes();
  } catch (err) {
    // ignore if it doesn't exist
  }
  await BOM.syncIndexes();

  await BOM.deleteMany({});
  await MPN.deleteMany({});
  await Material.deleteMany({});
  await Vendor.deleteMany({});
  await Sequence.deleteMany({});

  const matProduct = await Material.create({ name: 'Final Product', code: 'PROD1', unit: 'pcs', type: 'Finished' });
  const matRaw = await Material.create({ name: 'Raw Metal', code: 'RAW1', unit: 'kg', type: 'Raw Material' });
  const vendor = await Vendor.create({ Vendor_ID: 'VND1', Company_Name: 'Test Vendor', name: 'Test Vendor', Tax_ID: '123', email: 'test@test.com', Contact_Email: 'test@test.com' });
  const mpnRaw = await MPN.create({ manufacturerPartNumber: 'RAW-P-1', manufacturerName: 'Test Mfr', materialId: matRaw._id, vendorId: vendor._id, price: 100, moq: 1 });

  // 1. Create BOM via Controller
  req.body = {
    productId: matProduct._id,
    batchSize: 1,
    batchUOM: 'pcs',
    components: [{ mpnId: mpnRaw._id, qty: 5, lossPercent: 10 }],
    packagingCost: 450,
    processingCost: 200,
    overheadCost: 50
  };

  let validationPassed = false;
  validateBomRecipe(req, res, () => { validationPassed = true; });
  if(!validationPassed) {
    console.error("FAIL: Validation failed:", res.data);
    process.exit(1);
  }

  await bomController.createBOM(req, res, next);
  const createdBom = res.data.data;
  if (createdBom.packagingCost !== 450) {
    console.error("FAIL: Create BOM did not persist packagingCost");
    process.exit(1);
  }
  console.log("PASS: Create BOM persisted manual costs");

  // 2. Get BOM via Controller
  req.params.id = createdBom._id;
  await bomController.getBOM(req, res, next);
  const fetchedBom = res.data.data;
  
  if (fetchedBom.breakdown.packagingCost !== 450) {
    console.error("FAIL: Get BOM did not return correct breakdown packagingCost");
    process.exit(1);
  }
  
  const expectedRawCost = (5 * 100) / 0.9;
  if (Math.abs(fetchedBom.breakdown.rawMaterialCost - expectedRawCost) > 0.01) {
    console.error("FAIL: Get BOM did not calculate rawMaterialCost correctly");
    process.exit(1);
  }
  console.log("PASS: Get BOM cost breakdown is accurate");

  // 3. Edit BOM via Controller (Versioning)
  req.body = {
    productId: matProduct._id,
    batchSize: 1,
    batchUOM: 'pcs',
    version: 1, // Current version
    components: [{ mpnId: mpnRaw._id, qty: 10, lossPercent: 0 }],
    packagingCost: 600,
    processingCost: 0,
    overheadCost: 0
  };
  await bomController.updateBOM(req, res, next);
  const editedBom = res.data.data;
  
  if (editedBom.version !== 2) {
    console.error("FAIL: Edit BOM did not increment version");
    process.exit(1);
  }
  if (editedBom.bomNumber !== createdBom.bomNumber) {
    console.error(`FAIL: Edit BOM lost bomNumber. Expected ${createdBom.bomNumber}, got ${editedBom.bomNumber}`);
    process.exit(1);
  }
  if (editedBom.packagingCost !== 600) {
    console.error("FAIL: Edit BOM did not update manual costs");
    process.exit(1);
  }
  console.log("PASS: Edit BOM preserved bomNumber, incremented version, updated costs");

  // 4. Duplicate BOM via Controller
  req.params.id = editedBom._id;
  await bomController.duplicateBOM(req, res, next);
  const duplicatedBom = res.data.data;
  
  if (duplicatedBom.bomNumber === editedBom.bomNumber) {
    console.error("FAIL: Duplicate BOM did not generate a new bomNumber");
    process.exit(1);
  }
  if (duplicatedBom.version !== 1) {
    console.error("FAIL: Duplicate BOM version is not 1");
    process.exit(1);
  }
  if (duplicatedBom.packagingCost !== 600) {
    console.error("FAIL: Duplicate BOM did not copy manual costs");
    process.exit(1);
  }
  console.log(`PASS: Duplicate BOM generated new bomNumber ${duplicatedBom.bomNumber} and copied data successfully`);

  console.log("ALL REGRESSION TESTS PASSED.");
  await mongoose.connection.close();
}

runApiTest();
