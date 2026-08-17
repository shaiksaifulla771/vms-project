const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Material = require('../../models/Material');
const Vendor = require('../../models/Vendor');
const MPN = require('../../models/MPN');
const BOM = require('../../models/BOM');
const FlatBOM = require('../../models/FlatBOM');
const cacheService = require('../../services/cacheService');
const bomExplosionService = require('../../services/bomExplosionService');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Material.deleteMany({});
  await Vendor.deleteMany({});
  await MPN.deleteMany({});
  await BOM.deleteMany({});
  await FlatBOM.deleteMany({});
});

describe('Masters & BOM Performance Optimization Unit Tests', () => {
  test('1. Material indexing & lean pagination works efficiently', async () => {
    const materialsData = [];
    for (let i = 1; i <= 25; i++) {
      materialsData.push({
        name: `Organic Wheat Flour ${i}`,
        code: `M${1000 + i}`,
        unit: 'kg',
        type: 'Raw Material',
        subcategory: 'Grains',
        basePrice: 45 + i,
        status: 'Active'
      });
    }
    await Material.insertMany(materialsData);

    const page1 = await Material.find({ status: 'Active' })
      .select('name code unit basePrice type subcategory status')
      .sort({ createdAt: -1 })
      .skip(0)
      .limit(10)
      .lean();

    expect(page1).toHaveLength(10);
    expect(page1[0]).toHaveProperty('code');
    expect(page1[0]).toHaveProperty('basePrice');
    expect(page1[0].name).toBeDefined();
  });

  test('2. CacheService stores, retrieves, and invalidates keys properly', async () => {
    const testKey = 'test:materials:list:1';
    const testData = { success: true, count: 5, items: [{ name: 'Test Material' }] };

    await cacheService.set(testKey, testData, 60);
    const retrieved = await cacheService.get(testKey);
    expect(retrieved).toEqual(testData);

    await cacheService.invalidatePattern('test:materials:*');
    const afterInvalidation = await cacheService.get(testKey);
    expect(afterInvalidation).toBeNull();
  });

  test('3. BOM Multi-Level Explosion precomputes FlatBOM hierarchy with costs', async () => {
    // Create Raw Materials
    const rawFlour = await Material.create({
      name: 'Organic Wheat Flour',
      code: 'M1001',
      unit: 'kg',
      type: 'Raw Material',
      basePrice: 50,
      status: 'Active'
    });

    const rawSugar = await Material.create({
      name: 'Cane Sugar',
      code: 'M1002',
      unit: 'kg',
      type: 'Raw Material',
      basePrice: 40,
      status: 'Active'
    });

    // Create Semi-Finished Dough
    const semiDough = await Material.create({
      name: 'Cookie Dough Base',
      code: 'M2001',
      unit: 'kg',
      type: 'Semi-Finished',
      basePrice: 100,
      status: 'Active'
    });

    // Create Finished Cookie
    const finCookie = await Material.create({
      name: 'Chocolate Chip Cookie Pack',
      code: 'M3001',
      unit: 'box',
      type: 'Finished',
      basePrice: 250,
      status: 'Active'
    });

    // Subassembly BOM (Dough = 2kg Flour + 1kg Sugar)
    const doughBom = await BOM.create({
      productId: semiDough._id,
      bomNumber: 'BOM-DOUGH-01',
      batchSize: 3,
      batchUOM: 'kg',
      status: 'Active',
      components: [
        { materialId: rawFlour._id, quantity: 2, uom: 'kg', lossPercentage: 0 },
        { materialId: rawSugar._id, quantity: 1, uom: 'kg', lossPercentage: 0 }
      ]
    });

    // Finished Good BOM (Cookie = 1.5kg Dough)
    const cookieBom = await BOM.create({
      productId: finCookie._id,
      bomNumber: 'BOM-COOKIE-01',
      batchSize: 10,
      batchUOM: 'box',
      status: 'Active',
      packagingCost: 20,
      components: [
        { materialId: semiDough._id, quantity: 1.5, uom: 'kg', lossPercentage: 5 }
      ]
    });

    // Explode Cookie BOM
    const flatResult = await bomExplosionService.syncFlatBOM(cookieBom._id);
    expect(flatResult).toBeDefined();
    expect(flatResult.nodes.length).toBeGreaterThan(0);

    const l1Node = flatResult.nodes.find(n => n.level === 1);
    expect(l1Node).toBeDefined();
    expect(l1Node.materialName).toBe('Cookie Dough Base');
    expect(l1Node.isSubassembly).toBe(true);

    const l2Flour = flatResult.nodes.find(n => n.level === 2 && n.materialName === 'Organic Wheat Flour');
    expect(l2Flour).toBeDefined();

    // Verify cache hit
    const cachedExplosion = await bomExplosionService.getExplosion(cookieBom._id);
    expect(cachedExplosion.totalCost).toBe(flatResult.totalCost);
  });
});
