const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Warehouse = require('../../../models/Warehouse');
const Site = require('../../../models/Site');
const Material = require('../../../models/Material');
const InventoryItem = require('../../../models/InventoryItem');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');

describe('Access Control Suite 8: Location Deactivation & Dormant Assignment Preservation', () => {
  let app;
  let adminUser, staffUser, site, warehouse, material;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_deactivation';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'super-secret-key-32-chars-long-12345';
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
    app = require('../../../app');
  });

  afterAll(async () => {
    await User.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await Material.deleteMany({}).catch(() => {});
    await InventoryItem.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await Material.deleteMany({}).catch(() => {});
    await InventoryItem.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});

    const suffix = Date.now() + Math.floor(Math.random() * 1000);
    adminUser = await User.create({
      username: `admin_${suffix}`,
      email: `admin_${suffix}@vms.com`,
      password: 'adminpassword',
      role: 'Admin',
      accountStatus: 'Active',
      isVerified: true
    });

    staffUser = await User.create({
      username: `staff_assn_${suffix}`,
      email: `staff_assn_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    site = await Site.create({
      name: `Pune Facility ${suffix}`,
      code: `PUN-${suffix}`,
      status: 'Active'
    });

    warehouse = await Warehouse.create({
      name: `Pune Spare Parts WH ${suffix}`,
      code: `WH-PUN-${suffix}`,
      siteId: site._id,
      status: 'Active'
    });

    material = await Material.create({
      code: `MAT-${suffix}`,
      name: 'Raw Material Sheet',
      category: 'Raw Materials',
      unit: 'pcs'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Deactivation is blocked when warehouse has active inventory items (qty > 0)', async () => {
    await InventoryItem.create({
      materialId: material._id,
      warehouseId: warehouse._id,
      balance: 50,
      onHand: 50,
      available: 50
    });

    const res = await request(app)
      .post('/api/access/locations/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scopeType: 'warehouse',
        scopeId: warehouse._id,
        reason: 'Warehouse decommission'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Deactivation blocked: Warehouse contains 1 active inventory line item(s)');

    const whDoc = await Warehouse.findById(warehouse._id);
    expect(whDoc.status).toBe('Active');
  });

  test('2. Successful deactivation transitions active assignments to dormant state without deleting them', async () => {
    const assignment = await UserAccessAssignment.create({
      userId: staffUser._id,
      scopeType: 'warehouse',
      scopeId: warehouse._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Assigned to warehouse'
    });

    const res = await request(app)
      .post('/api/access/locations/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scopeType: 'warehouse',
        scopeId: warehouse._id,
        reason: 'Decommissioned empty warehouse'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const whDoc = await Warehouse.findById(warehouse._id);
    expect(whDoc.status).toBe('Inactive');

    const updatedAssignment = await UserAccessAssignment.findById(assignment._id);
    expect(updatedAssignment.status).toBe('dormant');
    expect(updatedAssignment.reason).toContain('Location deactivated');
  });
});
