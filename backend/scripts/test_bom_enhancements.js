const mongoose = require('mongoose');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');
const bomCostService = require('../services/bomCostService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms_test_db_bom_enh';

async function runTests() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to DB for testing.');

    // Clean up
    await BOM.deleteMany({});
    await MPN.deleteMany({});
    await Material.deleteMany({});
    await Vendor.deleteMany({});
    await Sequence.deleteMany({});

    // Setup basic test data
    const matProduct = await Material.create({ name: 'Final Product', code: 'PROD1', unit: 'pcs', type: 'Finished' });
    const matRaw = await Material.create({ name: 'Raw Metal', code: 'RAW1', unit: 'kg', type: 'Raw Material' });
    const matPkg = await Material.create({ name: 'Box', code: 'BOX1', unit: 'pcs', type: 'Packaged Material' });
    
    const vendor = await Vendor.create({ 
      Vendor_ID: 'VND1', 
      Company_Name: 'Test Vendor', 
      name: 'Test Vendor',
      Tax_ID: '123', 
      email: 'test@test.com',
      Contact_Email: 'test@test.com' 
    });

    const mpnRaw = await MPN.create({
      manufacturerPartNumber: 'RAW-P-1',
      manufacturerName: 'Test Mfr',
      materialId: matRaw._id,
      vendorId: vendor._id,
      price: 100, // Rs. 100 per kg
      moq: 1
    });

    const mpnPkg = await MPN.create({
      manufacturerPartNumber: 'BOX-P-1',
      manufacturerName: 'Test Mfr',
      materialId: matPkg._id,
      vendorId: vendor._id,
      price: 10, // Rs. 10 per pcs
      moq: 1
    });

    // 1. Create a BOM
    // Simulating controller logic
    let seqDoc = await Sequence.create({ _id: 'bomOrder', seq: 1000 });
    const bomNumber = `BOM-${seqDoc.seq}`;

    const components = [
      { mpnId: mpnRaw._id, qty: 5, lossPercent: 10 }, // 5 / 0.9 = 5.55 * 100 = 555.55
      { mpnId: mpnPkg._id, qty: 1, lossPercent: 0 }   // 1 * 10 = 10
    ];

    const bom = await BOM.create({
      productId: matProduct._id,
      bomNumber: bomNumber,
      batchSize: 1,
      batchUOM: 'pcs',
      components: components,
      packagingCost: 500,
      processingCost: 100,
      overheadCost: 0,
      version: 1,
      status: 'Active',
      effectiveDate: new Date()
    });

    console.log('--- TEST: BOM Creation ---');
    console.log(`BOM Created with number: ${bom.bomNumber}`);
    if (bom.bomNumber === 'BOM-1000') {
      console.log('PASS: bomNumber generated correctly');
    } else {
      console.error('FAIL: bomNumber generation');
    }

    // 2. Test Cost Breakdown (bomCostService.js)
    console.log('\n--- TEST: Cost Breakdown ---');
    const bomsToCalculate = await BOM.find({}).populate('components.mpnId');
    const calculatedBoms = await bomCostService.populateBomCostsBulk(bomsToCalculate);
    const cbom = calculatedBoms[0];

    // Raw Material Cost: (5 * 100 / 0.9) + (1 * 10) = 555.55 + 10 = 565.55
    // Packaging Cost: 500 (from BOM level)
    // Processing Cost: 100
    // Overhead Cost: 0
    console.log('Calculated breakdown:', cbom.breakdown);
    const expectedRawCost = ((5 * 100) / 0.9) + 10;
    const expectedPkgCost = 500;
    const expectedPrcCost = 100;
    
    if (Math.abs(cbom.breakdown.rawMaterialCost - expectedRawCost) < 0.01 && 
        cbom.breakdown.packagingCost === expectedPkgCost &&
        cbom.breakdown.processingCost === expectedPrcCost) {
      console.log('PASS: Breakdown calculated correctly with optional BOM costs.');
    } else {
      console.error('FAIL: Breakdown logic incorrect.');
    }

    // 3. Test Duplicate BOM Logic
    console.log('\n--- TEST: BOM Duplication ---');
    // Simulate duplication
    seqDoc = await Sequence.findByIdAndUpdate('bomOrder', { $inc: { seq: 1 } }, { new: true });
    const duplicateNumber = `BOM-${seqDoc.seq}`;

    const duplicatedComponents = bom.components.map(c => ({
      mpnId: c.mpnId,
      qty: c.qty,
      lossPercent: c.lossPercent
    }));

    const duplicateBom = await BOM.create({
      productId: bom.productId,
      bomNumber: duplicateNumber,
      notes: bom.notes || '',
      batchSize: bom.batchSize,
      batchUOM: bom.batchUOM,
      components: duplicatedComponents,
      version: 1,
      previousVersionId: null, // Independent
      effectiveDate: bom.effectiveDate,
      status: 'Draft'
    });

    console.log(`Duplicated BOM Number: ${duplicateBom.bomNumber}`);
    if (duplicateBom.bomNumber === 'BOM-1001') {
      console.log('PASS: Duplicated BOM received new sequence number');
    } else {
      console.error('FAIL: Duplicated BOM sequence logic');
    }

    if (duplicateBom.status === 'Draft' && duplicateBom.version === 1 && duplicateBom.previousVersionId === null) {
      console.log('PASS: Duplicated BOM status and version isolation logic correct');
    } else {
      console.error('FAIL: Duplicated BOM isolation metadata');
    }

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await mongoose.connection.close();
  }
}

runTests();
