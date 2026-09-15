const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Material = require('../../models/Material');
const Vendor = require('../../models/Vendor');
const Warehouse = require('../../models/Warehouse');
const PurchaseOrder = require('../../models/PurchaseOrder');
const AuditLog = require('../../models/AuditLog');
const InventoryItem = require('../../models/InventoryItem');
const InventoryTransaction = require('../../models/InventoryTransaction');
const auditService = require('../../services/auditService');

describe('Session 8 — End-to-End Correlation Tracing Integration Test (PO -> Approval -> GRN -> Ledger)', () => {
  let app;
  let adminToken;
  let adminUser;
  let testMaterial;
  let testVendor;
  let testWarehouse;
  const TEST_CORRELATION_ID = 'CORR-PURCHASE-GRN-99999-UUID';
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_correlation_e2e';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'super-secret-key-32-chars-long-12345';
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
    app = require('../../app');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Material.deleteMany({});
    await Vendor.deleteMany({});
    await Warehouse.deleteMany({});
    await PurchaseOrder.deleteMany({});
    await InventoryItem.deleteMany({});
    await InventoryTransaction.deleteMany({});
    await AuditLog.collection.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Material.deleteMany({});
    await Vendor.deleteMany({});
    await Warehouse.deleteMany({});
    await PurchaseOrder.deleteMany({});
    await InventoryItem.deleteMany({});
    await InventoryTransaction.deleteMany({});
    await AuditLog.collection.deleteMany({});

    // Setup seed data
    adminUser = await User.create({
      username: 'admin',
      email: 'admin@vms.com',
      password: 'adminpassword',
      role: 'Admin',
      accountStatus: 'Active',
      isVerified: true
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vms.com', password: 'adminpassword' });

    adminToken = loginRes.body.token;

    testMaterial = await Material.create({
      code: 'M-CORR-1',
      name: 'Correlation Steel Bar',
      type: 'Raw Material',
      category: 'Metals',
      unit: 'PCS'
    });

    testVendor = await Vendor.create({
      vendorId: 'V-CORR-1',
      name: 'Global Metals Inc',
      email: 'vendor@globalmetals.com',
      status: 'Active'
    });

    testWarehouse = await Warehouse.create({ code: 'WH-CORR-1', name: 'Main Plant Warehouse' });
  });

  test('Should thread a single correlationId through PO creation, Approval, and GRN Inventory Ledger write', async () => {
    // 1. Create Purchase Order with correlation header
    const poRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Correlation-Id', TEST_CORRELATION_ID)
      .send({
        vendorId: testVendor._id,
        materials: [
          { materialId: testMaterial._id, quantity: 500, unitPrice: 10 }
        ]
      });

    expect(poRes.status).toBe(201);
    expect(poRes.headers['x-correlation-id']).toBe(TEST_CORRELATION_ID);
    const poId = poRes.body.data._id;

    // 2. Approve Purchase Order
    const approveRes = await request(app)
      .patch(`/api/purchases/${poId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Correlation-Id', TEST_CORRELATION_ID)
      .send({ status: 'Approved' });

    expect(approveRes.status).toBe(200);

    // 3. Receive Purchase Order (GRN receipt) with correlation header
    const receiveRes = await request(app)
      .patch(`/api/purchases/${poId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Correlation-Id', TEST_CORRELATION_ID)
      .send({
        warehouseId: testWarehouse._id,
        itemsReceived: [
          { materialId: testMaterial._id, receivedQty: 500 }
        ]
      });

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.headers['x-correlation-id']).toBe(TEST_CORRELATION_ID);

    // 4. Verify Inventory Stock updated
    const itemInDb = await InventoryItem.findOne({ materialId: testMaterial._id, warehouseId: testWarehouse._id });
    expect(itemInDb).toBeDefined();
    expect(itemInDb.onHand).toBe(500);

    // 5. Query AuditLog for the correlationId
    const auditLogs = await AuditLog.find({ correlationId: TEST_CORRELATION_ID }).sort({ timestamp: 1 });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);

    // Verify all matching audit logs share the exact correlationId
    auditLogs.forEach(log => {
      expect(log.correlationId).toBe(TEST_CORRELATION_ID);
    });

    // 6. Verify SHA-256 Hash Chain Integrity across all generated audit logs
    const verification = await auditService.verifyChainIntegrity();
    expect(verification.valid).toBe(true);
  });
});
