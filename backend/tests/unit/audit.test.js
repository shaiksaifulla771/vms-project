const mongoose = require('mongoose');
const AuditLog = require('../../models/AuditLog');
const auditService = require('../../services/auditService');

describe('Session 3 — Audit Engine Hardening Unit Tests', () => {
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_audit';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
  });

  afterAll(async () => {
    await AuditLog.collection.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Bypass Mongoose pre-hook using raw driver collection for test cleanup
    await AuditLog.collection.deleteMany({});
  });

  test('1. Should generate valid SHA-256 hash chains for sequential audit logs', async () => {
    const entityId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const log1 = await auditService.writeAuditLog(null, 'Vendor', entityId, 'CREATE', null, { name: 'Acme Corp' }, userId);
    const log2 = await auditService.writeAuditLog(null, 'Vendor', entityId, 'UPDATE', { name: 'Acme Corp' }, { name: 'Acme Inc' }, userId);

    expect(log1).toBeDefined();
    expect(log1.previousHash).toBe('GENESIS');
    expect(log1.hashChain).toBeDefined();

    expect(log2).toBeDefined();
    expect(log2.previousHash).toBe(log1.hashChain);
    expect(log2.hashChain).toBeDefined();

    const verification = await auditService.verifyChainIntegrity();
    expect(verification.valid).toBe(true);
    expect(verification.totalRecords).toBe(2);
  });

  test('2. Should DETECT TAMPERING if an audit log record is manually altered in DB', async () => {
    const entityId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    await auditService.writeAuditLog(null, 'Material', entityId, 'CREATE', null, { code: 'M1001', price: 100 }, userId);
    await auditService.writeAuditLog(null, 'Material', entityId, 'UPDATE', { price: 100 }, { price: 150 }, userId);

    // Verify initial clean state
    let verification = await auditService.verifyChainIntegrity();
    expect(verification.valid).toBe(true);

    // Tamper directly via collection driver (bypassing Mongoose hooks)
    const logs = await AuditLog.find().sort({ timestamp: 1 });
    await AuditLog.collection.updateOne(
      { _id: logs[0]._id },
      { $set: { 'changes.after.price': 999 } }
    );

    // Run verification -> MUST detect broken chain
    verification = await auditService.verifyChainIntegrity();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(0);
  });

  test('3. Should BLOCK Mongoose update/delete operations (append-only enforcement)', async () => {
    const entityId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const log = await auditService.writeAuditLog(null, 'PurchaseOrder', entityId, 'CREATE', null, { poNumber: 'PO1001' }, userId);

    // Attempt Mongoose updateOne -> MUST throw
    await expect(
      AuditLog.updateOne({ _id: log._id }, { $set: { action: 'DELETE' } })
    ).rejects.toThrow('AuditLog is append-only: updates and deletes are forbidden');

    // Attempt Mongoose deleteOne -> MUST throw
    await expect(
      AuditLog.deleteOne({ _id: log._id })
    ).rejects.toThrow('AuditLog is append-only: updates and deletes are forbidden');

    // Attempt Mongoose deleteMany -> MUST throw
    await expect(
      AuditLog.deleteMany({})
    ).rejects.toThrow('AuditLog is append-only: updates and deletes are forbidden');
  });

  test('4. Should log sensitive read access via logReadAccess', async () => {
    const entityId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const log = await auditService.logReadAccess('Vendor', entityId, ['bankDetails', 'taxId'], userId, '192.168.1.1', 'CORR-1234');

    expect(log.action).toBe('VIEW');
    expect(log.changes.fieldsAccessed).toEqual(['bankDetails', 'taxId']);
    expect(log.correlationId).toBe('CORR-1234');
    expect(log.ipAddress).toBe('192.168.1.1');
  });

  test('5. Should allow legal hold toggling via direct collection update', async () => {
    const entityId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const log = await auditService.writeAuditLog(null, 'BOM', entityId, 'CREATE', null, { code: 'BOM-001' }, userId);

    // Directly update legalHold flag using collection.updateOne (bypassing pre-hooks)
    await AuditLog.collection.updateOne(
      { _id: log._id },
      { $set: { legalHold: true } }
    );

    const updatedLog = await AuditLog.findById(log._id);
    expect(updatedLog.legalHold).toBe(true);
  });
});
