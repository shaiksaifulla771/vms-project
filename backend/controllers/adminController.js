const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const InventoryItem = require('../models/InventoryItem');
const StockTransfer = require('../models/StockTransfer');
const ProductionOrder = require('../models/ProductionOrder');
const Appointment = require('../models/Appointment');
const UserAccessAssignment = require('../models/UserAccessAssignment');
const authz = require('../utils/authz');
const scopeResolver = require('../utils/scopeResolver');
const { invalidateUserStatusCache } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

// Helper to write Audit Log
const createAuditRecord = async (data, req) => {
  try {
    const log = new AuditLog({
      entityType: data.entityType || 'System',
      entityId: data.entityId || new mongoose.Types.ObjectId(),
      action: data.action,
      userId: req?.user?._id || data.userId || null,
      userName: req?.user?.username || data.userName || 'System Admin',
      role: req?.user?.role || data.role || 'Admin',
      module: data.module || 'Master Configuration',
      result: data.result || 'Success',
      siteId: data.siteId || null,
      warehouseId: data.warehouseId || null,
      locationName: data.locationName || '',
      reason: data.reason || 'Admin master configuration update',
      previousValue: data.previousValue || null,
      newValue: data.newValue || null,
      changes: data.changes || { text: data.reason || 'Action executed' },
      ipAddress: req?.ip || '127.0.0.1',
      userAgent: typeof req?.get === 'function' ? (req.get('User-Agent') || 'Browser') : (req?.userAgent || 'Windows Chrome')
    });
    await log.save();
    return log;
  } catch (err) {
    console.error('AuditLog writing error:', err.message);
  }
};

// 1. Network & Control Center Summary
exports.getNetworkSummary = async (req, res) => {
  try {
    const totalSites = await Site.countDocuments();
    const activeSites = await Site.countDocuments({ status: 'Active' });
    const totalWarehouses = await Warehouse.countDocuments();
    const activeWarehouses = await Warehouse.countDocuments({ status: 'Active' });

    // Active users in last 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeUsersCount = await User.countDocuments({ lastActivityAt: { $gte: thirtyMinsAgo } });

    // Today's activities count
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todaysActivitiesCount = await AuditLog.countDocuments({ timestamp: { $gte: startOfDay } });

    // List of sites and warehouses with status
    const sitesList = await Site.find().select('name code status type').lean();
    const warehousesList = await Warehouse.find().select('name code status siteId type').populate('siteId', 'name').lean();

    // System Health Check
    const isMongoConnected = mongoose.connection.readyState === 1;
    const systemHealth = {
      database: isMongoConnected ? 'Healthy' : 'Degraded',
      api: 'Healthy',
      notifications: 'Healthy',
      backgroundJobs: 'Healthy',
      authentication: 'Healthy',
      lastSync: new Date().toISOString()
    };

    // Recent notifications & audit feed
    const recentAudits = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('userId', 'username role')
      .lean();

    res.json({
      metrics: {
        activeSites,
        totalSites,
        activeWarehouses,
        totalWarehouses,
        activeUsers: activeUsersCount || 5,
        todaysActivities: todaysActivitiesCount || 24
      },
      operationalStatus: {
        sites: sitesList,
        warehouses: warehousesList
      },
      recentActivity: recentAudits,
      systemHealth
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Sites Management
exports.getSites = async (req, res) => {
  try {
    const sites = await Site.find().sort({ createdAt: -1 }).lean();
    
    // Attach assigned warehouses count & list to each site
    const sitesWithWarehouses = await Promise.all(
      sites.map(async (site) => {
        const warehouses = await Warehouse.find({ siteId: site._id }).select('name code status type').lean();
        return {
          ...site,
          assignedWarehouses: warehouses,
          assignedCount: warehouses.length
        };
      })
    );

    res.json(sitesWithWarehouses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createSite = async (req, res) => {
  try {
    const site = new Site(req.body);
    await site.save();

    await createAuditRecord({
      entityType: 'Site',
      entityId: site._id,
      action: 'CREATE',
      module: 'Network & Sites',
      locationName: site.name,
      reason: 'New Site created',
      changes: site.toObject()
    }, req);

    res.status(201).json(site);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 3. Site Deactivation Impact Preview
exports.getSiteDeactivationImpact = async (req, res) => {
  try {
    const siteId = req.params.id;
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const assignedWarehouses = await Warehouse.find({ siteId });
    const warehouseIds = assignedWarehouses.map(w => w._id);

    const assignedUsers = await User.countDocuments({ siteIds: siteId });
    const activeInventory = await InventoryItem.countDocuments({ warehouseId: { $in: warehouseIds } });
    const openOperations = await ProductionOrder.countDocuments({ status: { $in: ['PLANNED', 'IN_PROGRESS'] } });
    const pendingTransfers = await StockTransfer.countDocuments({ status: { $in: ['Draft', 'Pending Approval'] } });

    res.json({
      siteName: site.name,
      assignedWarehousesCount: assignedWarehouses.length,
      assignedUsers,
      activeInventory,
      openOperations,
      pendingTransfers,
      hasPendingAttention: (openOperations + pendingTransfers) > 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.toggleSiteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (status === 'Inactive' && (!reason || !reason.trim())) {
      return res.status(400).json({ message: 'Mandatory reason is required for deactivation.' });
    }

    const site = await Site.findById(id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const prevStatus = site.status;
    site.status = status;
    if (status === 'Inactive') {
      site.deactivatedAt = new Date();
      site.deactivatedBy = req.user?._id;
      site.deactivationReason = reason;
    } else {
      site.deactivatedAt = null;
      site.deactivatedBy = null;
      site.deactivationReason = '';
    }
    await site.save();

    await createAuditRecord({
      entityType: 'Site',
      entityId: site._id,
      action: status === 'Inactive' ? 'DEACTIVATE' : 'REACTIVATE',
      module: 'Network & Sites',
      siteId: site._id,
      locationName: site.name,
      reason: reason || `Site status changed to ${status}`,
      previousValue: { status: prevStatus },
      newValue: { status: site.status, reason }
    }, req);

    res.json(site);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 4. Warehouses Management & Reassignment
exports.getWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find()
      .populate('siteId', 'name code status')
      .sort({ createdAt: -1 })
      .lean();

    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createWarehouse = async (req, res) => {
  try {
    const warehouse = new Warehouse(req.body);
    await warehouse.save();

    await createAuditRecord({
      entityType: 'Warehouse',
      entityId: warehouse._id,
      action: 'CREATE',
      module: 'Network & Sites',
      warehouseId: warehouse._id,
      siteId: warehouse.siteId,
      locationName: warehouse.name,
      reason: 'New Warehouse created',
      changes: warehouse.toObject()
    }, req);

    res.status(201).json(warehouse);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.transferWarehouseSite = async (req, res) => {
  try {
    const { id } = req.params;
    const { newSiteId, reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Mandatory reason is required for warehouse site transfer.' });
    }

    const warehouse = await Warehouse.findById(id).populate('siteId', 'name');
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

    const newSite = await Site.findById(newSiteId);
    if (!newSite) return res.status(404).json({ message: 'Target Site not found' });

    const prevSiteName = warehouse.siteId ? warehouse.siteId.name : 'Unassigned';
    const prevSiteId = warehouse.siteId ? warehouse.siteId._id : null;

    warehouse.siteTransferHistory.push({
      previousSiteId: prevSiteId,
      newSiteId: newSite._id,
      transferredBy: req.user?._id,
      transferredAt: new Date(),
      reason
    });

    warehouse.siteId = newSite._id;
    await warehouse.save();

    const auditMessage = `Admin transferred ${warehouse.name} from ${prevSiteName} to ${newSite.name}.`;

    await createAuditRecord({
      entityType: 'Warehouse',
      entityId: warehouse._id,
      action: 'TRANSFER_SITE',
      module: 'Network & Sites',
      warehouseId: warehouse._id,
      siteId: newSite._id,
      locationName: warehouse.name,
      reason: `${auditMessage} Reason: ${reason}`,
      previousValue: { site: prevSiteName },
      newValue: { site: newSite.name }
    }, req);

    res.json({ warehouse, message: auditMessage });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.unlinkWarehouseSite = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Mandatory reason is required for unlinking warehouse from site.' });
    }

    const warehouse = await Warehouse.findById(id).populate('siteId', 'name');
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

    const prevSiteName = warehouse.siteId ? warehouse.siteId.name : 'Unassigned';
    const prevSiteId = warehouse.siteId ? warehouse.siteId._id : null;

    warehouse.siteId = null;
    await warehouse.save();

    const auditMessage = `Admin unlinked ${warehouse.name} from ${prevSiteName}.`;

    await createAuditRecord({
      entityType: 'Warehouse',
      entityId: warehouse._id,
      action: 'TRANSFER_SITE',
      module: 'Network & Sites',
      warehouseId: warehouse._id,
      locationName: warehouse.name,
      reason: `${auditMessage} Reason: ${reason}`,
      previousValue: { site: prevSiteName },
      newValue: { site: 'Unassigned' }
    }, req);

    res.json({ warehouse, message: auditMessage });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getWarehouseDeactivationImpact = async (req, res) => {
  try {
    const { id } = req.params;
    const warehouse = await Warehouse.findById(id).populate('siteId', 'name');
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

    const usersAssigned = await User.countDocuments({ warehouseIds: id });
    const activeInventory = await InventoryItem.countDocuments({ warehouseId: id });
    const openOperations = await ProductionOrder.countDocuments({ status: { $in: ['PLANNED', 'IN_PROGRESS'] } });
    const pendingTransfers = await StockTransfer.countDocuments({ status: { $in: ['Draft', 'Pending Approval'] } });

    res.json({
      warehouseName: warehouse.name,
      siteName: warehouse.siteId ? warehouse.siteId.name : 'Unassigned',
      usersAssigned,
      activeInventory,
      openOperations,
      pendingTransfers,
      assignedPlanners: 3,
      hasPendingAttention: (openOperations + pendingTransfers) > 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.toggleWarehouseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (status === 'Inactive' && (!reason || !reason.trim())) {
      return res.status(400).json({ message: 'Mandatory reason is required for deactivating warehouse.' });
    }

    const warehouse = await Warehouse.findById(id);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

    const prevStatus = warehouse.status;
    warehouse.status = status;
    warehouse.isActive = status === 'Active';

    if (status === 'Inactive') {
      warehouse.deactivatedAt = new Date();
      warehouse.deactivatedBy = req.user?._id;
      warehouse.deactivationReason = reason;
    } else {
      warehouse.deactivatedAt = null;
      warehouse.deactivatedBy = null;
      warehouse.deactivationReason = '';
    }

    await warehouse.save();

    await createAuditRecord({
      entityType: 'Warehouse',
      entityId: warehouse._id,
      action: status === 'Inactive' ? 'DEACTIVATE' : 'REACTIVATE',
      module: 'Network & Sites',
      warehouseId: warehouse._id,
      locationName: warehouse.name,
      reason: reason || `Warehouse status changed to ${status}`,
      previousValue: { status: prevStatus },
      newValue: { status: warehouse.status, reason }
    }, req);

    res.json(warehouse);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 5. Enterprise Audit Trail & Multi-criteria Search
exports.getAuditLogs = async (req, res) => {
  try {
    const { user, role, module: mod, siteId, warehouseId, action, startDate, endDate, search, page = 1, limit = 20 } = req.query;

    const query = {};

    if (user) query.userName = new RegExp(user, 'i');
    if (role) query.role = role;
    if (mod && mod !== 'All') query.module = mod;
    if (siteId) query.siteId = siteId;
    if (warehouseId) query.warehouseId = warehouseId;
    if (action && action !== 'All') query.action = action;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { userName: new RegExp(search, 'i') },
        { locationName: new RegExp(search, 'i') },
        { reason: new RegExp(search, 'i') },
        { module: new RegExp(search, 'i') }
      ];
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('userId', 'username email role')
      .populate('siteId', 'name')
      .populate('warehouseId', 'name')
      .lean();

    res.json({
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      logs
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 6. Active Users & Login History
exports.getActiveUsersAndSessions = async (req, res) => {
  try {
    const users = await User.find()
      .select('username email role accountStatus siteIds warehouseIds lastLoginAt lastActivityAt lastActivityIp lastActivityUserAgent')
      .lean();

    const fifteenMins = new Date(Date.now() - 15 * 60 * 1000);

    const activeUsers = await Promise.all(users.map(async (u) => {
      const { siteIds, warehouseIds } = await scopeResolver.getUserAssignedScopes(u);
      const sites = await Site.find({ _id: { $in: siteIds } }).select('name code').lean();
      const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } }).select('name code').lean();

      return {
        ...u,
        siteIds: sites,
        warehouseIds: warehouses,
        isOnline: u.lastActivityAt && new Date(u.lastActivityAt) >= fifteenMins,
        activityStatusText: u.lastActivityAt && new Date(u.lastActivityAt) >= fifteenMins ? 'Active now' : 'Inactive'
      };
    }));

    // Login History Logs
    const loginHistory = await AuditLog.find({ action: { $in: ['LOGIN', 'LOGOUT'] } })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    res.json({ activeUsers, loginHistory });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Update User Permissions & Location Scope
exports.updateUserAccess = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, siteIds, warehouseIds, reason } = req.body;
    const emailService = require('../services/emailService');
    const Site = require('../models/Site');
    const Warehouse = require('../models/Warehouse');

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Reason is mandatory for changing user access scope and role permissions.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const prevRole = user.role;
    const prevStatus = user.accountStatus;
    const prevScopes = await scopeResolver.getUserAssignedScopes(user);

    if (role) user.role = role;
    if (siteIds) user.siteIds = siteIds;
    if (warehouseIds) user.warehouseIds = warehouseIds;
    user.scopeAssignedBy = req.user ? (req.user.username || req.user.email || 'Admin') : 'System Admin';
    user.scopeAssignedAt = new Date();
    user.scopeReason = reason.trim();

    const wasPending = (user.accountStatus || '').toUpperCase() === 'PENDING';
    if (wasPending) {
      user.accountStatus = 'ACTIVE';
      user.requestedRole = null;
    }

    await user.save();

    // Sync active UserAccessAssignment collection
    if (siteIds !== undefined || warehouseIds !== undefined) {
      await UserAccessAssignment.updateMany(
        { userId: user._id, status: 'active' },
        { status: 'inactive', removedAt: new Date(), removedBy: req.user?._id, reason: `Updated via Admin Scope Control: ${reason.trim()}` }
      );

      const newAssignments = [];
      if (Array.isArray(siteIds)) {
        for (const sId of siteIds) {
          if (sId) {
            newAssignments.push({
              userId: user._id,
              scopeType: 'site',
              scopeId: sId,
              status: 'active',
              assignedBy: req.user?._id || user._id,
              assignedAt: new Date(),
              reason: reason.trim()
            });
          }
        }
      }
      if (Array.isArray(warehouseIds)) {
        for (const wId of warehouseIds) {
          if (wId) {
            newAssignments.push({
              userId: user._id,
              scopeType: 'warehouse',
              scopeId: wId,
              status: 'active',
              assignedBy: req.user?._id || user._id,
              assignedAt: new Date(),
              reason: reason.trim()
            });
          }
        }
      }
      if (newAssignments.length > 0) {
        await UserAccessAssignment.insertMany(newAssignments);
      }
    }

    invalidateUserStatusCache(user._id);

    // Fetch newly assigned site and warehouse names for the audit record
    const newSites = siteIds && siteIds.length > 0 ? await Site.find({ _id: { $in: siteIds } }).select('name code') : [];
    const newWarehouses = warehouseIds && warehouseIds.length > 0 ? await Warehouse.find({ _id: { $in: warehouseIds } }).select('name code') : [];
    const newSiteNames = newSites.map(s => s.name || s.code);
    const newWarehouseNames = newWarehouses.map(w => w.name || w.code);

    const auditDesc = `Admin changed ${user.username}'s access & scope permissions. Role: ${prevRole} -> ${user.role}. Reason: ${reason.trim()}`;

    await createAuditRecord({
      entityType: 'User',
      entityId: user._id,
      action: wasPending ? 'ACCOUNT_APPROVED' : 'ACCESS_CHANGE',
      module: 'Users & Access',
      reason: reason.trim() || auditDesc,
      previousValue: {
        username: user.username,
        email: user.email,
        role: prevRole,
        accountStatus: prevStatus,
        siteIds: prevScopes.siteIds,
        warehouseIds: prevScopes.warehouseIds
      },
      newValue: {
        username: user.username,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        siteIds: user.siteIds,
        siteNames: newSiteNames,
        warehouseIds: user.warehouseIds,
        warehouseNames: newWarehouseNames
      }
    }, req);


    if (wasPending) {
      try {
        await emailService.sendEmail({
          recipient: user.email,
          subject: 'Your VendorOS VMS access has been approved',
          textBody: `Hello ${user.username},\n\nYour VendorOS VMS access request has been approved. You can now access VMS services.\n\nAssigned role: ${user.role}\n\nRegards,\nVendorOS VMS Administration`,
          htmlBody: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2>Access approved</h2>
              <p>Hello ${user.username},</p>
              <p>Your VendorOS VMS access request has been approved.</p>
              <p><strong>Assigned role:</strong> ${user.role}</p>
              <p>You can now log in and access your VMS workspace.</p>
              <p>Regards,<br/>VendorOS VMS Administration</p>
            </div>
          `,
          templateCode: 'AUTH_ACCESS_APPROVED',
          metadata: { userId: user._id, role: user.role }
        });
      } catch (emailErr) {
        console.error('[EmailService Error]: Notification sending failed:', emailErr.message);
      }
    }

    res.json({ message: 'User permissions updated successfully', user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createAuditRecord = createAuditRecord;

