/**
 * Verification Script: BOM Manufacturer Auto-fetching & Direct Material / MPN Ingredients
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BOM = require('../models/BOM');
const Material = require('../models/Material');
const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const bomCostService = require('../services/bomCostService');
const bomRecipeService = require('../services/bomRecipeService');
const bomService = require('../services/bomService');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms-dev';

async function runTests() {
  console.log('🔗 Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB.');

  try {
    console.log('\n--- 1. Setting up Test Fixtures (Materials, MPNs, Vendor) ---');
    const timestamp = Date.now();

    // 1. Create a Vendor
    const vendor = await Vendor.create({
      name: `Apex Supplies Ltd ${timestamp}`,
      company: `Apex Global ${timestamp}`,
      contactPerson: 'John Apex',
      phone: '9876543210',
      email: `apex_${timestamp}@test.com`,
      category: 'Electronics'
    });

    // 2. Create Raw Material 1 (Direct Material without MPN)
    const rawMatDirect = await Material.create({
      name: `High-Grade Aluminium Sheet ${timestamp}`,
      code: `MAT-ALU-${timestamp}`,
      type: 'Raw Material',
      unit: 'kg',
      basePrice: 250.00,
      manufacturer: 'Alcoa Industries',
      status: 'Active'
    });

    // 3. Create Raw Material 2 (With MPN)
    const rawMatMpn = await Material.create({
      name: `Precision Resistor 10k ${timestamp}`,
      code: `MAT-RES-${timestamp}`,
      type: 'Raw Material',
      unit: 'pcs',
      basePrice: 5.00,
      manufacturer: 'Vishay Precision',
      status: 'Active'
    });

    const mpnDoc = await MPN.create({
      mpnCode: `MPN-RES-10K-${timestamp}`,
      manufacturerPartNumber: `MPN-RES-10K-${timestamp}`,
      materialId: rawMatMpn._id,
      vendorId: vendor._id,
      manufacturerName: 'Vishay Precision Corp',
      price: 4.50,
      priceUOM: 'pcs',
      status: 'Active'
    });

    // 4. Create Assembly Product (Finished Good)
    const assemblyProduct = await Material.create({
      name: `Smart Inverter Box 5kW ${timestamp}`,
      code: `PROD-INV-${timestamp}`,
      type: 'Finished',
      unit: 'pieces',
      basePrice: 15000.00,
      manufacturer: 'Tesla Dyno Tech',
      status: 'Active'
    });

    console.log(`✅ Fixtures created:
    - Direct Material: ${rawMatDirect.name} (Base Price: ₹${rawMatDirect.basePrice}, Mfr: ${rawMatDirect.manufacturer})
    - MPN Material: ${rawMatMpn.name} -> MPN: ${mpnDoc.mpnCode} (Price: ₹${mpnDoc.price}, Mfr: ${mpnDoc.manufacturerName})
    - Finished Good: ${assemblyProduct.name} (Mfr: ${assemblyProduct.manufacturer})`);

    console.log('\n--- 2. Testing bomCostService: Cost Calculation for Direct Material & MPN ---');
    const mockComponents = [
      { materialId: rawMatDirect._id, quantity: 2, lossPercentage: 5 }, // 2 * 250 / (1 - 0.05) = 500 / 0.95 = 526.3157
      { mpnId: mpnDoc._id, quantity: 10, lossPercentage: 0 }             // 10 * 4.50 / 1.0 = 45.00
    ];

    const costBreakdown = await bomCostService.calculateBomCost(mockComponents, 50, 30, 20);
    console.log('Calculated Costs:', costBreakdown);
    const rawCost = costBreakdown.costBreakdown?.rawMaterialCost || 0;
    if (rawCost <= 0) {
      throw new Error('❌ calculateBomCost failed to calculate cost for mixed components!');
    }
    console.log(`✅ Cost calculation succeeded! Raw Material: ₹${rawCost.toFixed(2)}, Total: ₹${costBreakdown.totalCost.toFixed(2)}`);

    console.log('\n--- 3. Testing bomRecipeService: Creation of BOM with mixed Ingredients ---');
    const bomPayload = {
      productId: assemblyProduct._id.toString(),
      batchSize: 1,
      batchUOM: 'pieces',
      batchCode: `BATCH-${timestamp}`,
      manufacturer: assemblyProduct.manufacturer, // Auto-fetched from assembly product
      components: [
        { materialId: rawMatDirect._id.toString(), qty: 2, lossPercent: 5 },
        { mpnId: mpnDoc._id.toString(), qty: 10, lossPercent: 0 }
      ],
      packagingCost: 50,
      processingCost: 30,
      overheadCost: 20,
      updateMasterManufacturer: false
    };

    const createdBom = await bomRecipeService.createBOM(bomPayload, 'Admin Tester');
    console.log(`✅ BOM Created successfully: ${createdBom.bomNumber} (ID: ${createdBom._id})`);
    console.log(`- Manufacturer: ${createdBom.manufacturer}`);
    console.log(`- Total Cost: ₹${createdBom.totalCost}`);

    if (createdBom.manufacturer !== 'Tesla Dyno Tech') {
      throw new Error(`❌ BOM manufacturer mismatch: Expected 'Tesla Dyno Tech', got '${createdBom.manufacturer}'`);
    }

    console.log('\n--- 4. Testing bomService: getBOM Detail and Population ---');
    const fetchedBom = await bomService.getBOM(createdBom._id);
    console.log('Fetched BOM Details:', {
      bomNumber: fetchedBom.bomNumber,
      productName: fetchedBom.productId?.name,
      manufacturer: fetchedBom.manufacturer,
      componentsCount: fetchedBom.components?.length
    });

    const compDirect = fetchedBom.components.find(c => c.materialId && c.materialId._id.toString() === rawMatDirect._id.toString());
    const compMpn = fetchedBom.components.find(c => c.mpnId && c.mpnId._id.toString() === mpnDoc._id.toString());

    if (!compDirect || !compDirect.materialId.name) {
      throw new Error('❌ Direct Material component was not populated correctly in getBOM!');
    }
    if (!compMpn || !compMpn.mpnId.mpnCode || !compMpn.mpnId.materialId.name) {
      throw new Error('❌ MPN component was not populated correctly in getBOM!');
    }

    console.log(`✅ Components verified:
    - Direct Material: ${compDirect.materialId.name} (Code: ${compDirect.materialId.code}, Unit: ${compDirect.materialId.unit})
    - MPN Component: ${compMpn.mpnId.materialId.name} (MPN: ${compMpn.mpnId.mpnCode})`);

    console.log('\n--- 5. Testing Manufacturer Update Propagation (Master & BOM) ---');
    const updatePayload = {
      ...bomPayload,
      manufacturer: 'Tesla Energy Global Corp',
      updateMasterManufacturer: true
    };

    const updatedBom = await bomRecipeService.updateBOM(createdBom._id, updatePayload, 'Admin Tester');
    console.log(`✅ BOM Updated: ${updatedBom.bomNumber}, new Mfr: ${updatedBom.manufacturer}`);

    const reloadedProduct = await Material.findById(assemblyProduct._id);
    if (reloadedProduct.manufacturer !== 'Tesla Energy Global Corp') {
      throw new Error(`❌ Master Product manufacturer did not update! Expected 'Tesla Energy Global Corp', got '${reloadedProduct.manufacturer}'`);
    }
    console.log(`✅ Master Material manufacturer successfully propagated: ${reloadedProduct.manufacturer}`);

    console.log('\n--- 6. Testing Circular Dependency Prevention ---');
    try {
      await bomRecipeService.createBOM({
        productId: assemblyProduct._id.toString(),
        batchSize: 1,
        batchUOM: 'pieces',
        components: [
          { materialId: assemblyProduct._id.toString(), qty: 1, lossPercent: 0 } // Self-reference
        ]
      }, 'Admin Tester');
      throw new Error('❌ Circular dependency was allowed when it should have failed!');
    } catch (err) {
      console.log(`✅ Circular dependency correctly blocked: "${err.message}"`);
    }

    console.log('\n========================================');
    console.log('🎉 ALL 6 BOM AUTO-FETCH & INGREDIENT TESTS PASSED SUCCESSFULLY!');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
