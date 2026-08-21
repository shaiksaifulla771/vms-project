const mongoose = require('mongoose');
const User = require('../models/User');
const UserAccessAssignment = require('../models/UserAccessAssignment');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const InventoryItem = require('../models/InventoryItem');
const StockTransfer = require('../models/StockTransfer');
const ProductionOrder = require('../models/ProductionOrder');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const authz = require('../utils/authz');
const { invalidateUserStatusCache } = require('../middleware/authMiddleware');
const emailService = require('./emailService');

/**
 * Resilient transaction wrapper supporting replica sets with automatic single-node fallback
 */
async function executeInTransaction(fn) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    return await fn(null);
  }

  try {
    let result;
    if (session && typeof session.withTransaction === 'function') {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } else {
      return await fn(null);
    }
  } catch (err) {
    if (err.message && err.message.includes('Transaction numbers are only allowed on a replica set member')) {
      return await fn(null);
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }
}

// Helper to write an immutable Audit Record
async function writeAuditLog({ entityType, entityId, action, module = 'Access Control', reason, previousValue, newValue, adminUser }) {
  try {
    const log = new AuditLog({
      entityType,
      entityId,
      action,
      module,
      userId: adminUser?._id || null,
      userName: adminUser?.username || 'System Admin',
      role: adminUser?.role || 'Admin',
      reason: reason || 'Access control update',
      previousValue,
      newValue,
      changes: { previous: previousValue || null, next: newValue || null },
      timestamp: new Date()
    });
    await log.save();
    return log;
  } catch (err) {
    console.error('[AuditLog Error]: Failed to write access audit log:', err.message);
  }
}

/**
 * Server-Side Last-Admin Protection Guard
 */
async function assertNotLastAdmin(targetUserId, requestedRole, requestedStatus) {
  const isDemotingOrDeactivating = 
    (requestedRole && requestedRole.toLowerCase() !== 'admin') ||
    (requestedStatus && requestedStatus.toUpperCase() !== 'ACTIVE');

  if (!isDemotingOrDeactivating) return;

  const targetUser = await User.findById(targetUserId).select('_id role accountStatus').lean();
  if (!targetUser) return;

  const isTargetAdmin = authz.isGlobalAdmin(targetUser);
  const isTargetActive = (targetUser.accountStatus || '').toUpperCase() === 'ACTIVE';

  if (!isTargetAdmin || !isTargetActive) return;

  const remainingActiveAdmins = await User.countDocuments({
    _id: { $ne: targetUser._id },
    role: { $in: ['Admin', 'admin'] },
    accountStatus: { $in: ['ACTIVE', 'Active', 'approved', 'APPROVED'] }
  });

  if (remainingActiveAdmins === 0) {
    throw new Error('Operation blocked: Cannot de-escalate, suspend, or deactivate the sole remaining Administrator.');
  }
}

/**
 * Guard against unlinking user who owns active in-flight work at location
 */
async function assertNoInFlightWorkForUnlink(userId, scopeType, scopeId) {
  if (scopeType === 'warehouse') {
    const inFlightTransfers = await StockTransfer.countDocuments({
      createdBy: userId,
      status: { $in: ['Draft', 'Pending Approval', 'In Transit'] },
      $or: [{ fromWarehouseId: scopeId }, { toWarehouseId: scopeId }, { fromWarehouse: scopeId }, { toWarehouse: scopeId }]
    });
    if (inFlightTransfers > 0) {
      throw new Error(`Cannot unlink user: ${inFlightTransfers} in-flight stock transfer(s) are actively owned by this user at this warehouse. Reassign transfers before unlinking.`);
    }
  }

  if (scopeType === 'site' || scopeType === 'manufacturingPlant') {
    const activeProductionOrders = await ProductionOrder.countDocuments({
      siteId: scopeId,
      assignedTo: userId,
      status: { $in: ['Draft', 'Released', 'In Production', 'Partially Completed'] }
    });
    if (activeProductionOrders > 0) {
      throw new Error(`Cannot unlink user: ${activeProductionOrders} active production order(s) are assigned to this user at this site. Reassign orders before unlinking.`);
    }
  }
}

/**
 * Assign access scope to a user with duplicate detection and replace support
 */
exports.assignScope = async ({ userId, scopeType, scopeId, accessLevel, effectiveUntil, adminUser, reason, replaceExisting = false }) => {
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required for scope assignment.');
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('Target user not found.');

  // Validate location existence if models exist
  if (scopeType === 'site' || scopeType === 'manufacturingPlant') {
    const site = await Site.findById(scopeId);
    if (!site) throw new Error(`Site (${scopeId}) not found.`);
  } else if (scopeType === 'warehouse') {
    const warehouse = await Warehouse.findById(scopeId);
    if (!warehouse) throw new Error(`Warehouse (${scopeId}) not found.`);
  }

  const existing = await UserAccessAssignment.findOne({
    userId,
    scopeType,
    scopeId,
    status: 'active'
  });

  if (existing) {
    if (!replaceExisting) {
      return {
        duplicate: true,
        message: `User already has an active assignment to this ${scopeType}. Choose replace to update effective dates or access level.`,
        existingAssignment: existing
      };
    }
    // Deactivate existing assignment
    existing.status = 'inactive';
    existing.removedAt = new Date();
    existing.removedBy = adminUser?._id || null;
    existing.reason = `Replaced by new assignment: ${reason.trim()}`;
    await existing.save();
  }

  const newAssignment = await UserAccessAssignment.create({
    userId,
    scopeType,
    scopeId,
    accessLevel: scopeType === 'manufacturingPlant' ? (accessLevel || 'limited') : null,
    effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : null,
    status: 'active',
    assignedBy: adminUser?._id || user._id,
    assignedAt: new Date(),
    reason: reason.trim()
  });

  invalidateUserStatusCache(userId);

  await writeAuditLog({
    entityType: 'UserAccessAssignment',
    entityId: newAssignment._id,
    action: 'ASSIGN_SCOPE',
    reason: reason.trim(),
    previousValue: existing ? { id: existing._id, accessLevel: existing.accessLevel, effectiveUntil: existing.effectiveUntil } : null,
    newValue: { id: newAssignment._id, userId, scopeType, scopeId, accessLevel: newAssignment.accessLevel, effectiveUntil: newAssignment.effectiveUntil },
    adminUser
  });

  return { duplicate: false, assignment: newAssignment };
};

/**
 * Concurrency-safe atomic scope transfer with optimistic status lock
 */
exports.transferScope = async ({ fromAssignmentId, toUserId, adminUser, reason }) => {
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required for scope transfer.');
  }

  const toUser = await User.findById(toUserId);
  if (!toUser) throw new Error('Target recipient user not found.');

  const result = await executeInTransaction(async (session) => {
    const opts = session ? { session } : {};
    const queryOpts = session ? { session, new: false } : { new: false };

    // 1. Optimistic concurrency lock: only succeeds if currently 'active'
    const original = await UserAccessAssignment.findOneAndUpdate(
      { _id: fromAssignmentId, status: 'active' },
      {
        status: 'transferred',
        removedAt: new Date(),
        removedBy: adminUser?._id || null,
        reason: `Transferred to ${toUser.username} (${toUserId}): ${reason.trim()}`
      },
      queryOpts
    );

    if (!original) {
      throw new Error('Conflict: Assignment state has changed or was already transferred/unlinked. Please refresh and retry.');
    }

    // 2. Create destination active assignment
    const created = await UserAccessAssignment.create([{
      userId: toUserId,
      scopeType: original.scopeType,
      scopeId: original.scopeId,
      accessLevel: original.accessLevel,
      status: 'active',
      assignedBy: adminUser?._id || original.assignedBy,
      assignedAt: new Date(),
      reason: `Received transfer from user ${original.userId}: ${reason.trim()}`,
      transferId: original._id
    }], opts);

    const newAssignment = created[0];

    // 3. Link transferId on original
    await UserAccessAssignment.updateOne(
      { _id: original._id },
      { transferId: newAssignment._id },
      opts
    );

    // 4. Create Notification for admin
    await Notification.create([{
      recipientRole: 'admin',
      type: 'access_transferred',
      relatedUserId: toUserId,
      message: `Scope ${original.scopeType} (${original.scopeId}) was transferred to ${toUser.username} by ${adminUser?.username || 'Admin'}.`,
      severity: 'info'
    }], opts);

    return newAssignment;
  });

  invalidateUserStatusCache(toUserId);

  await writeAuditLog({
    entityType: 'UserAccessAssignment',
    entityId: result._id,
    action: 'TRANSFER_SCOPE',
    reason: reason.trim(),
    previousValue: { fromAssignmentId },
    newValue: { toAssignmentId: result._id, toUserId },
    adminUser
  });

  return result;
};

/**
 * Unlink scope with in-flight work validation
 */
exports.unlinkScope = async ({ assignmentId, adminUser, reason }) => {
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required to unlink access scope.');
  }

  const assignment = await UserAccessAssignment.findById(assignmentId);
  if (!assignment || assignment.status !== 'active') {
    throw new Error('Active scope assignment not found.');
  }

  // Check in-flight work
  await assertNoInFlightWorkForUnlink(assignment.userId, assignment.scopeType, assignment.scopeId);

  assignment.status = 'inactive';
  assignment.removedAt = new Date();
  assignment.removedBy = adminUser?._id || null;
  assignment.reason = reason.trim();
  await assignment.save();

  invalidateUserStatusCache(assignment.userId);

  await writeAuditLog({
    entityType: 'UserAccessAssignment',
    entityId: assignment._id,
    action: 'UNLINK_SCOPE',
    reason: reason.trim(),
    previousValue: { status: 'active' },
    newValue: { status: 'inactive', removedAt: assignment.removedAt },
    adminUser
  });

  return assignment;
};

/**
 * Bulk assign scopes (capped at max 100 items, independent row outcomes)
 */
exports.bulkAssignScopes = async ({ items, adminUser, reason }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items array is required.');
  }
  if (items.length > 100) {
    throw new Error('Maximum 100 items permitted per bulk operation.');
  }

  const results = [];
  for (const item of items) {
    try {
      const res = await exports.assignScope({
        userId: item.userId,
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        accessLevel: item.accessLevel,
        effectiveUntil: item.effectiveUntil,
        adminUser,
        reason: reason || item.reason || 'Bulk scope assignment',
        replaceExisting: Boolean(item.replaceExisting)
      });
      results.push({ success: true, item, result: res });
    } catch (err) {
      results.push({ success: false, item, error: err.message });
    }
  }

  return {
    total: items.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results
  };
};

/**
 * Bulk deactivate users (capped at max 100, requires confirm: true, last-admin guarded)
 */
exports.bulkDeactivateUsers = async ({ userIds, confirm, adminUser, reason }) => {
  if (!confirm) {
    throw new Error('Explicit confirmation { confirm: true } is required for bulk deactivation.');
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new Error('userIds array is required.');
  }
  if (userIds.length > 100) {
    throw new Error('Maximum 100 users permitted per bulk deactivation.');
  }
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required for bulk deactivation.');
  }

  const results = [];
  for (const uId of userIds) {
    try {
      await assertNotLastAdmin(uId, null, 'DEACTIVATED');

      const user = await User.findById(uId);
      if (!user) throw new Error('User not found');

      user.accountStatus = 'DEACTIVATED';
      await user.save();

      // Flag active assignments dormant (never delete)
      await UserAccessAssignment.updateMany(
        { userId: uId, status: 'active' },
        { status: 'dormant', removedAt: new Date(), removedBy: adminUser?._id || null, reason: `User deactivated: ${reason.trim()}` }
      );

      invalidateUserStatusCache(uId);

      await writeAuditLog({
        entityType: 'User',
        entityId: uId,
        action: 'DEACTIVATE_USER',
        reason: reason.trim(),
        previousValue: { accountStatus: user.accountStatus },
        newValue: { accountStatus: 'DEACTIVATED' },
        adminUser
      });

      results.push({ success: true, userId: uId });
    } catch (err) {
      results.push({ success: false, userId: uId, error: err.message });
    }
  }

  return {
    total: userIds.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results
  };
};

/**
 * Atomic user registration approval with decoupled email dispatch
 */
exports.approveRegistration = async ({ userId, role, scopeAssignments = [], adminUser, reason }) => {
  let userEmail;
  let username;

  await executeInTransaction(async (session) => {
    const opts = session ? { session } : {};
    const queryOpts = session ? { session, new: true, select: 'email username' } : { new: true, select: 'email username' };

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, approvalStatus: { $in: ['PENDING', 'Pending'] } },
      {
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
        role: role || 'Viewer',
        approvedBy: adminUser?._id || null,
        approvedAt: new Date()
      },
      queryOpts
    );

    if (!updatedUser) {
      throw new Error('User not found or not in pending approval state.');
    }
    userEmail = updatedUser.email;
    username = updatedUser.username;

    if (scopeAssignments && scopeAssignments.length > 0) {
      const assignmentsWithMeta = scopeAssignments.map(a => ({
        ...a,
        userId,
        status: 'active',
        assignedBy: adminUser?._id || updatedUser._id,
        assignedAt: new Date(),
        reason: reason || 'Initial registration approval scope assignment'
      }));
      await UserAccessAssignment.insertMany(assignmentsWithMeta, opts);
    }
  });

  invalidateUserStatusCache(userId);

  await writeAuditLog({
    entityType: 'User',
    entityId: userId,
    action: 'APPROVE_REGISTRATION',
    reason: reason || `Approved by ${adminUser?.username || 'Admin'}`,
    previousValue: { approvalStatus: 'PENDING', accountStatus: 'PENDING' },
    newValue: { approvalStatus: 'APPROVED', accountStatus: 'ACTIVE', role },
    adminUser
  });

  // Decoupled asynchronous email dispatch outside transactional boundary
  emailService.sendEmail({
    recipient: userEmail,
    templateCode: 'AUTH_ACCESS_APPROVED',
    metadata: { userId, role, username }
  }).catch(err => console.error('[Email Queue Error]: Failed to dispatch approval notification:', err.message));

  return { success: true, userId, email: userEmail, role };
};

/**
 * Reject user registration with mandatory reason and immutable audit log entry
 */
exports.rejectRegistration = async ({ userId, reason, adminUser }) => {
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required to reject registration.');
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found.');

  const prevStatus = user.approvalStatus;
  user.approvalStatus = 'REJECTED';
  user.accountStatus = 'REJECTED';
  user.rejectionReason = reason.trim();
  await user.save();

  invalidateUserStatusCache(userId);

  await writeAuditLog({
    entityType: 'User',
    entityId: userId,
    action: 'REJECT_REGISTRATION',
    reason: reason.trim(),
    previousValue: { approvalStatus: prevStatus },
    newValue: { approvalStatus: 'REJECTED', rejectionReason: reason.trim() },
    adminUser
  });

  return { success: true, userId, status: 'REJECTED' };
};

/**
 * Deactivate site or warehouse with blocking condition validation and dormant assignment preservation
 */
exports.deactivateLocation = async ({ scopeType, scopeId, adminUser, reason }) => {
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required to deactivate location.');
  }

  if (scopeType === 'warehouse') {
    const stockCount = await InventoryItem.countDocuments({
      warehouseId: scopeId,
      $or: [
        { quantity: { $gt: 0 } },
        { balance: { $gt: 0 } },
        { onHand: { $gt: 0 } }
      ]
    });
    if (stockCount > 0) {
      throw new Error(`Deactivation blocked: Warehouse contains ${stockCount} active inventory line item(s) with stock > 0. Transfer or scrap stock first.`);
    }

    const openTransfers = await StockTransfer.countDocuments({
      status: { $in: ['Draft', 'Pending Approval', 'In Transit'] },
      $or: [{ fromWarehouseId: scopeId }, { toWarehouseId: scopeId }, { fromWarehouse: scopeId }, { toWarehouse: scopeId }]
    });
    if (openTransfers > 0) {
      throw new Error(`Deactivation blocked: ${openTransfers} open stock transfer(s) reference this warehouse.`);
    }

    const warehouse = await Warehouse.findById(scopeId);
    if (!warehouse) throw new Error('Warehouse not found.');

    warehouse.status = 'Inactive';
    warehouse.isActive = false;
    warehouse.deactivatedAt = new Date();
    warehouse.deactivatedBy = adminUser?._id || null;
    warehouse.deactivationReason = reason.trim();
    await warehouse.save();
  } else if (scopeType === 'site' || scopeType === 'manufacturingPlant') {
    const activeOrders = await ProductionOrder.countDocuments({
      siteId: scopeId,
      status: { $in: ['Draft', 'Released', 'In Production', 'Partially Completed'] }
    });
    if (activeOrders > 0) {
      throw new Error(`Deactivation blocked: Site has ${activeOrders} active production order(s).`);
    }

    const site = await Site.findById(scopeId);
    if (!site) throw new Error('Site not found.');

    site.status = 'Inactive';
    site.deactivatedAt = new Date();
    site.deactivatedBy = adminUser?._id || null;
    site.deactivationReason = reason.trim();
    await site.save();
  }

  // Flag active assignments dormant without deleting them
  await UserAccessAssignment.updateMany(
    { scopeType, scopeId, status: 'active' },
    { status: 'dormant', removedAt: new Date(), removedBy: adminUser?._id || null, reason: `Location deactivated: ${reason.trim()}` }
  );

  await writeAuditLog({
    entityType: scopeType === 'warehouse' ? 'Warehouse' : 'Site',
    entityId: scopeId,
    action: 'DEACTIVATE_LOCATION',
    reason: reason.trim(),
    previousValue: { status: 'Active' },
    newValue: { status: 'Inactive' },
    adminUser
  });

  return { success: true, scopeType, scopeId, status: 'Inactive' };
};

/**
 * Fetch all active and historical scope assignments for a user
 */
exports.getUserAssignments = async (userId) => {
  return await UserAccessAssignment.find({ userId })
    .sort({ assignedAt: -1 })
    .populate('assignedBy', 'username email')
    .populate('removedBy', 'username email')
    .lean();
};

/**
 * Fetch users assigned to a specific scope location
 */
exports.getScopeUsers = async (scopeType, scopeId) => {
  return await UserAccessAssignment.find({
    scopeType,
    scopeId,
    status: 'active',
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: new Date() } }]
  })
    .populate('userId', 'username email role accountStatus')
    .populate('assignedBy', 'username email')
    .lean();
};

exports.assertNotLastAdmin = assertNotLastAdmin;
