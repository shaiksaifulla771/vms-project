const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const StockAdjustment = require('../models/StockAdjustment');
const StockTransfer = require('../models/StockTransfer');
const WarehouseMaterial = require('../models/WarehouseMaterial');

let token;
let adminUser;
let site1;
let wh1;
let wh2;
let testMaterial;

jest.setTimeout(30000);

describe('VMS ERP ARCHITECTURAL REDESIGN INTEGRATION SUITE', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_db');
    }

    adminUser = await User.findOne({ email: 'admin@vms.com' });
    if (!adminUser) {
      adminUser = await User.create({
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
      { id: adminUser._id, tokenVersion: adminUser.tokenVersion || 0 },
      secret,
      { expiresIn: '1d' }
    );

    site1 = await Site.create({
      code: `SITE-REDESIGN-${Date.now()}`,
      name: 'Bengaluru Manufacturing Complex',
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' }
    });

    wh1 = await Warehouse.create({
      code: `WH1-${Date.now()}`,
      name: 'Bengaluru Central Raw Warehouse',
      siteId: site1._id,
      type: 'Raw'
    });

    wh2 = await Warehouse.create({
      code: `WH2-${Date.now()}`,
      name: 'Bengaluru Finished Depot',
      siteId: site1._id,
      type: 'FG'
    });

    testMaterial = await Material.create({
      code: `RM-REDESIGN-${Date.now()}`,
      name: 'High Grade Silicon Wafers',
      unit: 'pcs',
      type: 'Raw Material'
    });

    // Seed initial inventory for wh1
    await InventoryItem.create({
      materialId: testMaterial._id,
      warehouseId: wh1._id,
      siteId: site1._id,
      balance: 1000,
      onHand: 1000,
      reserved: 0,
      reservedBalance: 0,
      available: 1000
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('1. Warehouse Material Assignment (No Record Duplication)', () => {
    it('POST /api/warehouse-materials/assign - Assigns material to warehouse', async () => {
      const res = await request(app)
        .post('/api/warehouse-materials/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({
          materialId: testMaterial._id,
          siteId: site1._id,
          warehouseId: wh1._id,
          minStock: 100,
          maxStock: 2000,
          reorderPoint: 300
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.materialId.toString()).toEqual(testMaterial._id.toString());
    });

    it('GET /api/warehouse-materials - Lists assignments without duplicating Material Master', async () => {
      const res = await request(app)
        .get('/api/warehouse-materials')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('2. Stock Adjustment Approval Workflow (Created By -> Approved By)', () => {
    let adjId;
    let adjNum;

    it('POST /api/inventory/adjustments - Submits adjustment request (Pending Approval)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          siteId: site1._id,
          warehouseId: wh1._id,
          materialId: testMaterial._id,
          adjustmentType: 'OUT',
          quantity: 50,
          reason: 'Moisture damage write-off test',
          description: 'Inspected batch 401'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Pending Approval');

      adjId = res.body.data._id;
      adjNum = res.body.data.adjNumber;

      // Verify stock in warehouse is UNCHANGED before approval
      const item = await InventoryItem.findOne({ materialId: testMaterial._id, warehouseId: wh1._id });
      expect(item.balance).toEqual(1000);
    });

    it('POST /api/inventory/adjustments/:id/approve - Approves adjustment and executes ledger entry', async () => {
      const res = await request(app)
        .post(`/api/inventory/adjustments/${adjId}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Approved');

      // Verify physical stock balance was reduced from 1000 -> 950
      const item = await InventoryItem.findOne({ materialId: testMaterial._id, warehouseId: wh1._id });
      expect(item.balance).toEqual(950);

      // Verify immutable InventoryTransaction ledger entry recorded
      const tx = await InventoryTransaction.findOne({ referenceId: adjNum });
      expect(tx).toBeDefined();
      expect(tx.type).toEqual('ADJUSTMENT_OUT');
      expect(tx.beforeQty).toEqual(1000);
      expect(tx.afterQty).toEqual(950);
    });
  });

  describe('3. Inter-Warehouse Stock Transfer Workflow (Approval -> In Transit -> Received)', () => {
    let trfId;

    it('POST /api/transfers - Creates stock transfer request (Pending Approval)', async () => {
      const res = await request(app)
        .post('/api/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fromSiteId: site1._id,
          fromWarehouseId: wh1._id,
          toSiteId: site1._id,
          toWarehouseId: wh2._id,
          materialId: testMaterial._id,
          quantity: 200,
          reason: 'Inter-depot rebalancing'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Pending Approval');

      trfId = res.body.data._id;
    });

    it('POST /api/transfers/:id/approve - Approves transfer & soft reserves stock', async () => {
      const res = await request(app)
        .post(`/api/transfers/${trfId}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Approved');

      // Verify soft reservation in source warehouse
      const item = await InventoryItem.findOne({ materialId: testMaterial._id, warehouseId: wh1._id });
      expect(item.reservedBalance).toBeGreaterThan(0);
    });

    it('POST /api/transfers/:id/dispatch - Dispatches transfer (In Transit)', async () => {
      const res = await request(app)
        .post(`/api/transfers/${trfId}/dispatch`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('In Transit');
    });

    it('POST /api/transfers/:id/receive - Receives transfer at destination warehouse', async () => {
      const res = await request(app)
        .post(`/api/transfers/${trfId}/receive`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data.status).toEqual('Completed');

      // Verify destination warehouse received 200 units
      const destItem = await InventoryItem.findOne({ materialId: testMaterial._id, warehouseId: wh2._id });
      expect(destItem.balance).toEqual(200);
    });
  });
});
