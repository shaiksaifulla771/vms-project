const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const seedNetworkAndAudit = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    await mongoose.connect(mongoUri);
    console.log('[Seed] Connected to MongoDB...');

    // 1. Seed Sites
    const hydSite = await Site.findOneAndUpdate(
      { code: 'HYD-01' },
      {
        code: 'HYD-01',
        name: 'Hyderabad Plant',
        type: 'Manufacturing Plant',
        address: { city: 'Hyderabad', state: 'Telangana', country: 'India' },
        status: 'Active'
      },
      { upsert: true, new: true }
    );

    const blrSite = await Site.findOneAndUpdate(
      { code: 'BLR-01' },
      {
        code: 'BLR-01',
        name: 'Bangalore Plant',
        type: 'Manufacturing Plant',
        address: { city: 'Bangalore', state: 'Karnataka', country: 'India' },
        status: 'Active'
      },
      { upsert: true, new: true }
    );

    const chnSite = await Site.findOneAndUpdate(
      { code: 'MAA-01' },
      {
        code: 'MAA-01',
        name: 'Chennai Distribution Center',
        type: 'Distribution Center',
        address: { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
        status: 'Active'
      },
      { upsert: true, new: true }
    );

    const puneSite = await Site.findOneAndUpdate(
      { code: 'PUN-01' },
      {
        code: 'PUN-01',
        name: 'Pune Facility',
        type: 'R&D Center',
        address: { city: 'Pune', state: 'Maharashtra', country: 'India' },
        status: 'Inactive',
        deactivationReason: 'Site restructuring and facility relocation to Bangalore'
      },
      { upsert: true, new: true }
    );

    // 2. Seed Warehouses
    const mainWh = await Warehouse.findOneAndUpdate(
      { code: 'HYD-MWH' },
      {
        code: 'HYD-MWH',
        name: 'Main Warehouse',
        siteId: hydSite._id,
        type: 'General',
        location: 'Hyderabad Plant - Block A',
        status: 'Active',
        isActive: true
      },
      { upsert: true, new: true }
    );

    const rmWh = await Warehouse.findOneAndUpdate(
      { code: 'HYD-RMW' },
      {
        code: 'HYD-RMW',
        name: 'Raw Material Warehouse',
        siteId: hydSite._id,
        type: 'Raw',
        location: 'Hyderabad Plant - Block B',
        status: 'Active',
        isActive: true
      },
      { upsert: true, new: true }
    );

    const fgWh = await Warehouse.findOneAndUpdate(
      { code: 'HYD-FGW' },
      {
        code: 'HYD-FGW',
        name: 'Finished Goods Warehouse',
        siteId: hydSite._id,
        type: 'FG',
        location: 'Hyderabad Plant - Logistics Gate',
        status: 'Active',
        isActive: true
      },
      { upsert: true, new: true }
    );

    const oldWh = await Warehouse.findOneAndUpdate(
      { code: 'PUN-OLD' },
      {
        code: 'PUN-OLD',
        name: 'Old Storage Depot',
        siteId: puneSite._id,
        type: 'Scrap',
        location: 'Pune Facility - Shed 4',
        status: 'Inactive',
        isActive: false,
        deactivationReason: 'Structure maintenance & obsolete inventory clearance'
      },
      { upsert: true, new: true }
    );

    // 3. Seed Sample Audit Logs
    const adminUser = await User.findOne({ role: 'Admin' });
    const adminId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

    const auditLogsToInsert = [
      {
        entityType: 'Warehouse',
        entityId: oldWh._id,
        action: 'DEACTIVATE',
        userId: adminId,
        userName: 'Admin User',
        role: 'Admin',
        module: 'Network & Sites',
        result: 'Success',
        siteId: puneSite._id,
        warehouseId: oldWh._id,
        locationName: oldWh.name,
        reason: 'Structure maintenance & obsolete inventory clearance',
        previousValue: { status: 'Active' },
        newValue: { status: 'Inactive', reason: 'Structure maintenance & obsolete inventory clearance' },
        changes: { status: 'Inactive' },
        timestamp: new Date(Date.now() - 30 * 60 * 1000)
      },
      {
        entityType: 'InventoryItem',
        entityId: new mongoose.Types.ObjectId(),
        action: 'UPDATE',
        userId: adminId,
        userName: 'Rahul Kumar',
        role: 'Inventory Manager',
        module: 'Inventory',
        result: 'Success',
        siteId: hydSite._id,
        warehouseId: rmWh._id,
        locationName: rmWh.name,
        reason: 'Stock transfer for production batch #1042',
        previousValue: { quantity: 150 },
        newValue: { quantity: 450 },
        changes: { quantity: '+300' },
        timestamp: new Date(Date.now() - 60 * 60 * 1000)
      },
      {
        entityType: 'Appointment',
        entityId: new mongoose.Types.ObjectId(),
        action: 'CREATE',
        userId: adminId,
        userName: 'Ahmed Khan',
        role: 'Planner',
        module: 'VMS',
        result: 'Success',
        siteId: hydSite._id,
        locationName: hydSite.name,
        reason: 'Scheduled vendor dispatch appointment',
        changes: { vendor: 'Acme Materials', time: '14:00' },
        timestamp: new Date(Date.now() - 120 * 60 * 1000)
      },
      {
        entityType: 'User',
        entityId: adminId,
        action: 'ACCESS_CHANGE',
        userId: adminId,
        userName: 'Admin User',
        role: 'Admin',
        module: 'Users & Access',
        result: 'Success',
        reason: 'Admin changed Rahul Kumar warehouse access scope to Main & Raw Material Warehouses',
        previousValue: { warehouseIds: [] },
        newValue: { warehouseIds: [mainWh._id, rmWh._id] },
        changes: { warehouseScope: 'Hyderabad Warehouses' },
        timestamp: new Date(Date.now() - 180 * 60 * 1000)
      },
      {
        entityType: 'ProductionOrder',
        entityId: new mongoose.Types.ObjectId(),
        action: 'CREATE',
        userId: adminId,
        userName: 'Priya Sharma',
        role: 'Production Manager',
        module: 'Production',
        result: 'Success',
        siteId: hydSite._id,
        warehouseId: fgWh._id,
        locationName: fgWh.name,
        reason: 'Material assigned for PCB Assembly Batch',
        changes: { targetQty: 500 },
        timestamp: new Date(Date.now() - 240 * 60 * 1000)
      }
    ];

    await AuditLog.insertMany(auditLogsToInsert);
    console.log('[Seed] Network & Audit logs seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]', err);
    process.exit(1);
  }
};

seedNetworkAndAudit();
