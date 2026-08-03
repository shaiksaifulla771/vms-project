const mongoose = require('mongoose');
const bomCostService = require('../services/bomCostService');
const BOM = require('../models/BOM');
const MPN = require('../models/MPN');
const MPNPriceHistory = require('../models/MPNPriceHistory');

// Minimal mock setup for unit tests
describe('BOM Recipe Enhancements & Costing', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_test_bom', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await BOM.deleteMany({});
    await MPN.deleteMany({});
    await MPNPriceHistory.deleteMany({});
  });

  const getMockMpnData = (num, price) => ({
    mpnCode: `MPN-TEST-${num}`,
    manufacturerName: 'Test Mfg',
    manufacturerPartNumber: `TEST-${num}`,
    price: price,
    status: 'Active',
    vendorId: new mongoose.Types.ObjectId(),
    materialId: new mongoose.Types.ObjectId()
  });

  it('should strictly retrieve price from MPN and ignore client overrides', async () => {
    const mpn = await MPN.create(getMockMpnData(1, 100));

    await MPNPriceHistory.create({
      mpnId: mpn._id,
      newPrice: 100,
      effectiveDate: new Date('2026-08-01')
    });

    const components = [{
      mpnId: mpn._id,
      qty: 2,
      lossPercent: 0,
      price: 50 // SHOULD BE IGNORED
    }];

    const { componentsWithCost, totalCost } = await bomCostService.calculateBomCost(components, new Date('2026-08-10'));
    
    expect(componentsWithCost[0].resolvedPrice).toBe(100);
    expect(componentsWithCost[0].lineCost).toBe(200);
    expect(totalCost).toBe(200);
  });

  it('should correctly calculate costs with loss factor', async () => {
    const mpn = await MPN.create(getMockMpnData(2, 55));

    const components = [{
      mpnId: mpn._id,
      qty: 13.9,
      lossPercent: 10
    }];

    const { componentsWithCost, totalCost } = await bomCostService.calculateBomCost(components, new Date());
    
    expect(componentsWithCost[0].resolvedPrice).toBe(55);
    expect(componentsWithCost[0].lineCost).toBeCloseTo(849.44, 2);
    expect(totalCost).toBeCloseTo(849.44, 2);
  });

  it('should use effective date pricing (BOM Versioning emulation)', async () => {
    const mpn = await MPN.create(getMockMpnData(3, 60));

    await MPNPriceHistory.create({
      mpnId: mpn._id,
      newPrice: 55,
      effectiveDate: new Date('2026-08-01')
    });

    await MPNPriceHistory.create({
      mpnId: mpn._id,
      newPrice: 60,
      effectiveDate: new Date('2026-08-15')
    });

    const components = [{
      mpnId: mpn._id,
      qty: 10,
      lossPercent: 0
    }];

    let result = await bomCostService.calculateBomCost(components, new Date('2026-08-10'));
    expect(result.componentsWithCost[0].resolvedPrice).toBe(55);
    expect(result.totalCost).toBe(550);

    result = await bomCostService.calculateBomCost(components, new Date('2026-08-20'));
    expect(result.componentsWithCost[0].resolvedPrice).toBe(60);
    expect(result.totalCost).toBe(600);
  });

  it('should fail if MPN has no price', async () => {
    // We bypass validation here to simulate bad data from before price was required
    const mpn = new MPN(getMockMpnData(4, 0));
    mpn.price = null;
    await mpn.save({ validateBeforeSave: false });

    const components = [{
      mpnId: mpn._id,
      qty: 1,
      lossPercent: 0
    }];

    await expect(bomCostService.calculateBomCost(components)).rejects.toThrow(/has no valid price/);
  });

  it('populateBomCostsBulk should efficiently resolve costs for multiple BOMs', async () => {
    const mpn = await MPN.create(getMockMpnData(5, 100));

    const boms = [
      {
        _id: 'bom1',
        effectiveDate: new Date('2026-08-01'),
        components: [{ mpnId: mpn._id, qty: 5, lossPercent: 0 }]
      },
      {
        _id: 'bom2',
        effectiveDate: new Date('2026-08-01'),
        components: [{ mpnId: mpn._id, qty: 10, lossPercent: 0 }]
      }
    ];

    const populated = await bomCostService.populateBomCostsBulk(boms);
    
    expect(populated.length).toBe(2);
    expect(populated[0].liveTotalCost).toBe(500);
    expect(populated[1].liveTotalCost).toBe(1000);
  });

  it('should fail validation if components array is empty', async () => {
    const bom = new BOM({
      productId: new mongoose.Types.ObjectId(),
      batchSize: 1,
      batchUOM: 'kg',
      components: [],
      version: 1,
      effectiveDate: new Date(),
      status: 'Active'
    });

    const error = await bom.validate().catch(e => e);
    expect(error.errors.components).toBeDefined();
    expect(error.errors.components.message).toMatch(/At least one component is required/);
  });

  it('should prevent concurrent edits (optimistic locking)', async () => {
    const mpn = await MPN.create(getMockMpnData(6, 100));

    const bom = await BOM.create({
      productId: new mongoose.Types.ObjectId(),
      batchSize: 1,
      batchUOM: 'kg',
      components: [{ mpnId: mpn._id, qty: 1, lossPercent: 0 }],
      version: 1,
      effectiveDate: new Date(),
      status: 'Active'
    });

    // Simulate User A and User B fetching the same BOM
    const userABom = await BOM.findById(bom._id);
    const userBBom = await BOM.findById(bom._id);

    // User A updates it
    userABom.batchSize = 2;
    await userABom.save();

    // User B tries to update it
    userBBom.batchSize = 3;
    let error;
    try {
      await userBBom.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.name).toBe('VersionError');
  });

  it('should maintain performance with 10,000 MPNs in bulk costing', async () => {
    // We mock the history lookup to just test the JS processing loop efficiency
    const boms = [];
    for (let i = 0; i < 10000; i++) {
      boms.push({
        _id: new mongoose.Types.ObjectId(),
        effectiveDate: new Date('2026-08-01'),
        components: [{ mpnId: new mongoose.Types.ObjectId(), qty: 2, lossPercent: 0 }]
      });
    }

    // Mock the Mongoose aggregate to return an empty array instantly (so we only measure our JS loops)
    const originalAggregate = MPNPriceHistory.aggregate;
    MPNPriceHistory.aggregate = jest.fn().mockResolvedValue([]);

    const start = performance.now();
    await bomCostService.populateBomCostsBulk(boms);
    const end = performance.now();

    MPNPriceHistory.aggregate = originalAggregate;

    // 10,000 BOMs should be processed (mostly defaulting to live price fallback) very quickly
    expect(end - start).toBeLessThan(1000); // less than 1 second
  });
});
