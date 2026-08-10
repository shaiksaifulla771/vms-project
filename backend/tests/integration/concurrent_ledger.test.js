const mongoose = require('mongoose');
const InventoryItem = require('../../models/InventoryItem');
const InventoryTransaction = require('../../models/InventoryTransaction');
const InventoryLedgerService = require('../../services/inventoryLedgerService');

describe('Session 4 — Concurrent Ledger Integration Test (10 Parallel Reservations)', () => {
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_concurrent_ledger';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
  });

  afterAll(async () => {
    await InventoryItem.deleteMany({});
    await InventoryTransaction.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await InventoryItem.deleteMany({});
    await InventoryTransaction.deleteMany({});
  });

  test('Should handle 10 parallel reservations on the exact same stock item with 100% atomic consistency', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    // Setup initial stock: 50 units
    await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 50,
      type: 'GRN'
    });

    // Fire 10 parallel reservation requests for 10 units each (Total requested: 100 units, but only 50 available)
    const reservationPromises = Array.from({ length: 10 }).map((_, index) => {
      return InventoryLedgerService.recordTransaction({
        materialId,
        warehouseId,
        quantity: 10,
        type: 'Reservation',
        idempotencyKey: `CONCURRENT-KEY-${index}`
      }).then(res => ({ status: 'fulfilled', value: res }))
        .catch(err => ({ status: 'rejected', reason: err.message }));
    });

    const results = await Promise.all(reservationPromises);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    // Exactly 5 reservations should succeed (5 x 10 = 50), and 5 must fail due to stock depletion
    expect(succeeded.length).toBe(5);
    expect(failed.length).toBe(5);

    // Verify all failed calls failed with insufficient available stock error
    failed.forEach(f => {
      expect(f.reason).toMatch(/Cannot reserve stock/);
    });

    // Inspect database state: onHand MUST be 50, available MUST be 0, reserved MUST be 50
    const finalItem = await InventoryItem.findOne({ materialId, warehouseId });
    expect(finalItem.onHand).toBe(50);
    expect(finalItem.available).toBe(0);
    expect(finalItem.reserved).toBe(50);
    expect(finalItem.available).toBeGreaterThanOrEqual(0); // Zero negative stock guarantee!
  });
});
