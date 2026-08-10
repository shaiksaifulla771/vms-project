const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

let token;
let testUser;
let testSite;
let testWarehouse;
let testRawMaterial1;
let testRawMaterial2;
let testFinishedProduct;
let testBom;
let createdPlanId;
let createdOrderId;

// Increase Jest timeout for DB operations
jest.setTimeout(30000);

describe('VMS ERP MASTER INTEGRATION & WORKFLOW VALIDATION SUITE', () => {
  beforeAll(async () => {
    // 0. Ensure mongoose is connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_db');
    }

    // 1. Authenticate admin user
    testUser = await User.findOne({ email: 'admin@vms.com' });
    if (!testUser) {
      testUser = await User.create({
        username: 'Test Admin',
        email: 'admin@vms.com',
        password: 'admin123',
        role: 'Admin',
        isVerified: true
      });
    }

    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'super-secret-key-32-chars-long-12345';
    token = jwt.sign(
      { id: testUser._id, tokenVersion: testUser.tokenVersion || 0 },
      secret,
      { expiresIn: '1d' }
    );

    // 2. Setup prerequisite master data
    testSite = await Site.findOne() || await Site.create({
      code: 'TEST-SITE-01',
      name: 'Primary Manufacturing Facility',
      address: 'Industrial Zone Phase II',
      status: 'Active'
    });

    testWarehouse = await Warehouse.findOne({ code: 'WH-01' }) || await Warehouse.create({
      code: 'WH-01',
      name: 'Central Raw Material & FG Warehouse',
      siteId: testSite._id,
      type: 'General',
      status: 'Active'
    });

    testRawMaterial1 = await Material.create({
      code: `RM-VAL-${Date.now()}-1`,
      name: 'Organic Rice Grains',
      unit: 'KG',
      type: 'Raw Material'
    });

    testRawMaterial2 = await Material.create({
      code: `RM-VAL-${Date.now()}-2`,
      name: 'Fortified Edible Oil',
      unit: 'L',
      type: 'Raw Material'
    });

    testFinishedProduct = await Material.create({
      code: `FG-VAL-${Date.now()}`,
      name: 'Premium Porridge Pack 500g',
      unit: 'pcs',
      type: 'Finished'
    });

    // Seed inventory for raw materials
    await InventoryItem.create({
      materialId: testRawMaterial1._id,
      warehouseId: testWarehouse._id,
      balance: 2000,
      onHand: 2000,
      reserved: 0,
      reservedBalance: 0,
      available: 2000
    });

    await InventoryItem.create({
      materialId: testRawMaterial2._id,
      warehouseId: testWarehouse._id,
      balance: 1000,
      onHand: 1000,
      reserved: 0,
      reservedBalance: 0,
      available: 1000
    });

    // Create BOM
    testBom = await BOM.create({
      productId: testFinishedProduct._id,
      bomNumber: `BOM-VAL-${Date.now()}`,
      batchSize: 100,
      batchUOM: 'pcs',
      version: 1,
      components: [
        { materialId: testRawMaterial1._id, qty: 1.5, quantity: 1.5, uom: 'KG', expectedCost: 50 },
        { materialId: testRawMaterial2._id, qty: 0.5, quantity: 0.5, uom: 'L', expectedCost: 30 }
      ]
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  // STAGE 1: Master Data Fetching APIs
  describe('Stage 1: Master Data APIs Verification', () => {
    it('GET /api/materials - Returns materials list from MongoDB', async () => {
      const res = await request(app)
        .get('/api/materials')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(Array.isArray(res.body.data || res.body.materials)).toBeTruthy();
    });

    it('GET /api/boms - Returns BOM recipes list from MongoDB', async () => {
      const res = await request(app)
        .get('/api/boms')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
    });

    it('GET /api/warehouses - Returns warehouse locations from MongoDB', async () => {
      const res = await request(app)
        .get('/api/warehouses')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
    });
  });

  // STAGE 2: MRP Demand Calculation
  describe('Stage 2: MRP Engine Calculation (/api/mrp/run)', () => {
    it('POST /api/mrp/run - Calculates net requirements from BOM & Inventory', async () => {
      const res = await request(app)
        .post('/api/mrp/run')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: testFinishedProduct._id,
          bomId: testBom._id,
          warehouseId: testWarehouse._id,
          targetQty: 200,
          requiredDate: new Date().toISOString()
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBeTruthy();
      expect(res.body.mrpRun).toBeDefined();
    });
  });

  // STAGE 3: Manual Production Plan (PLANNED status, physical inventory UNCHANGED)
  describe('Stage 3: Manual Production Plan Creation', () => {
    it('POST /api/production-plans - Creates plan in Unscheduled status without modifying physical stock', async () => {
      const initialStock1 = await InventoryItem.findOne({ materialId: testRawMaterial1._id, warehouseId: testWarehouse._id });
      const initialLedgerCount = await InventoryTransaction.countDocuments();

      const res = await request(app)
        .post('/api/production-plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: testFinishedProduct._id,
          bomId: testBom._id,
          warehouseId: testWarehouse._id,
          quantity: 100,
          requiredDate: new Date(Date.now() + 86400000).toISOString(),
          status: 'Unscheduled',
          notes: 'Master Validation Plan'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Unscheduled');

      createdPlanId = res.body.data._id;

      // Assert physical stock & ledger remain UNCHANGED
      const afterStock1 = await InventoryItem.findOne({ materialId: testRawMaterial1._id, warehouseId: testWarehouse._id });
      const afterLedgerCount = await InventoryTransaction.countDocuments();

      expect(afterStock1.balance).toEqual(initialStock1.balance);
      expect(afterStock1.reservedBalance).toEqual(0);
      expect(afterLedgerCount).toEqual(initialLedgerCount);
    });
  });

  // STAGE 4: Schedule -> Soft Reservation (Physical stock UNCHANGED, Reserved increases)
  describe('Stage 4: Scheduling & Soft Reservation Rules', () => {
    it('POST /api/production-plans/:id/schedule - Creates soft reservation and linked ProductionOrder', async () => {
      const res = await request(app)
        .post(`/api/production-plans/${createdPlanId}/schedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 100 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Scheduled');
      expect(res.body.order).toBeDefined();

      createdOrderId = res.body.order._id;

      // Verify soft reservation increased, physical onHand stock UNCHANGED
      const item1 = await InventoryItem.findOne({ materialId: testRawMaterial1._id, warehouseId: testWarehouse._id });
      expect(item1.balance).toEqual(2000); // Physical stock unchanged
      expect(item1.reservedBalance).toBeGreaterThan(0); // Reserved stock updated
    });
  });

  // STAGE 5: Unschedule -> Reservation Release (Physical stock UNCHANGED, Reserved decreases, NO fake consumption)
  describe('Stage 5: Unscheduling & Reservation Release Rules', () => {
    it('POST /api/production-plans/:id/unschedule - Releases soft reservation, cancels linked order, reverts plan to Unscheduled', async () => {
      const ledgerCountBefore = await InventoryTransaction.countDocuments();

      const res = await request(app)
        .post(`/api/production-plans/${createdPlanId}/unschedule`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Unscheduled');

      // Verify linked ProductionOrder status is Cancelled
      const orderDoc = await ProductionOrder.findById(createdOrderId);
      expect(orderDoc.status).toEqual('Cancelled');

      // Verify reservation was released
      const item1 = await InventoryItem.findOne({ materialId: testRawMaterial1._id, warehouseId: testWarehouse._id });
      expect(item1.balance).toEqual(2000); // Physical stock unchanged
      expect(item1.reservedBalance).toEqual(0); // Reservation released back to zero

      // Verify reservation release was recorded in transaction log without changing physical stock
      const ledgerCountAfter = await InventoryTransaction.countDocuments();
      expect(ledgerCountAfter).toBeGreaterThan(ledgerCountBefore);
    });

    it('Re-schedule plan for production execution', async () => {
      const res = await request(app)
        .post(`/api/production-plans/${createdPlanId}/schedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 100 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      createdOrderId = res.body.order._id;
    });
  });

  // STAGE 6: Production Execution & Actual Material Movement
  describe('Stage 6: Production Execution & Actual Inventory Ledger Movement', () => {
    it('POST /api/productions/:id/start - Starts shop-floor production', async () => {
      const res = await request(app)
        .post(`/api/productions/${createdOrderId}/start`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('In Progress');
    });

    it('POST /api/productions/:id/complete - Consumes materials, credits finished goods, and records InventoryLedger entries', async () => {
      const res = await request(app)
        .post(`/api/productions/${createdOrderId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ qcStatus: 'Passed' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Completed');

      // Verify Inventory Ledger entries exist
      const transactions = await InventoryTransaction.find({ referenceId: res.body.data.prdNumber });
      expect(transactions.length).toBeGreaterThan(0);
    });
  });
});
