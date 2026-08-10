const mongoose = require('mongoose');
const InventoryItem = require('../../models/InventoryItem');
const InventoryTransaction = require('../../models/InventoryTransaction');
const InventoryLedgerService = require('../../services/inventoryLedgerService');

describe('Session 4 — Inventory Ledger Unit Tests', () => {
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_ledger';

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

  test('1. Should process GRN (Goods Received Note) and increase onHand & available stock', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    const result = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 100,
      type: 'GRN'
    });

    expect(result.success).toBe(true);
    expect(result.itemBalances.onHand).toBe(100);
    expect(result.itemBalances.available).toBe(100);
  });

  test('2. Should soft-reserve available stock via Reservation transaction', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    // Step 1: Receive 100 units
    await InventoryLedgerService.recordTransaction({ materialId, warehouseId, quantity: 100, type: 'GRN' });

    // Step 2: Reserve 40 units
    const res = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 40,
      type: 'Reservation'
    });

    expect(res.itemBalances.onHand).toBe(100); // Physical stock unchanged
    expect(res.itemBalances.available).toBe(60);
    expect(res.itemBalances.reserved).toBe(40);
  });

  test('3. Should BLOCK Reservation if requested quantity exceeds available stock', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    await InventoryLedgerService.recordTransaction({ materialId, warehouseId, quantity: 30, type: 'GRN' });

    await expect(
      InventoryLedgerService.recordTransaction({ materialId, warehouseId, quantity: 50, type: 'Reservation' })
    ).rejects.toThrow(/Cannot reserve stock. Requested: 50, Available: 30/);
  });

  test('4. Should handle Release of reserved stock back to available', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    await InventoryLedgerService.recordTransaction({ materialId, warehouseId, quantity: 100, type: 'GRN' });
    await InventoryLedgerService.recordTransaction({ materialId, warehouseId, quantity: 40, type: 'Reservation' });

    const releaseRes = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 15,
      type: 'Release'
    });

    expect(releaseRes.itemBalances.available).toBe(75);
    expect(releaseRes.itemBalances.reserved).toBe(25);
  });

  test('5. Should handle QC Hold and QC Release workflow', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    await InventoryLedgerService.recordTransaction({ materialId, warehouseId, quantity: 100, type: 'GRN' });

    // QC Hold 20 units
    const qcHoldRes = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 20,
      type: 'QC Hold'
    });

    expect(qcHoldRes.itemBalances.available).toBe(80);
    expect(qcHoldRes.itemBalances.blocked).toBe(20);

    // QC Release 10 units
    const qcRelRes = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 10,
      type: 'QC Release'
    });

    expect(qcRelRes.itemBalances.available).toBe(90);
    expect(qcRelRes.itemBalances.blocked).toBe(10);
  });

  test('6. Should return identical existing transaction on duplicate Idempotency-Key', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();
    const idempotencyKey = 'IDEM-KEY-12345';

    const res1 = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 50,
      type: 'GRN',
      idempotencyKey
    });

    expect(res1.duplicate).toBeUndefined();
    expect(res1.itemBalances.onHand).toBe(50);

    // Second call with same idempotencyKey
    const res2 = await InventoryLedgerService.recordTransaction({
      materialId,
      warehouseId,
      quantity: 50,
      type: 'GRN',
      idempotencyKey
    });

    expect(res2.duplicate).toBe(true);
    expect(res2.transaction.txnId).toBe(res1.transaction.txnId);

    // Verify item balance was NOT mutated twice
    const item = await InventoryItem.findOne({ materialId, warehouseId });
    expect(item.onHand).toBe(50);
  });
});
