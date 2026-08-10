const mongoose = require('mongoose');
const Sequence = require('../../models/Sequence');
const sequenceService = require('../../services/sequenceService');

describe('Session 6 — Number Sequence Service Unit Tests', () => {
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_sequence';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
  });

  afterAll(async () => {
    await Sequence.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Sequence.deleteMany({});
  });

  test('1. Should generate formatted sequential code with default prefix and padding', async () => {
    const code1 = await sequenceService.getNextCode('vendorCode');
    const code2 = await sequenceService.getNextCode('vendorCode');

    expect(code1).toBe('V0001');
    expect(code2).toBe('V0002');
  });

  test('2. Should handle 10 concurrent code generation requests with 0 duplicates (Atomic $inc)', async () => {
    const requests = Array.from({ length: 10 }).map(() => sequenceService.getNextCode('materialCode'));
    const results = await Promise.all(requests);

    expect(results.length).toBe(10);

    // Verify all 10 generated codes are 100% unique
    const uniqueSet = new Set(results);
    expect(uniqueSet.size).toBe(10);

    // Verify format (M0001 through M0010)
    results.forEach(code => {
      expect(code).toMatch(/^M\d{4}$/);
    });
  });
});
