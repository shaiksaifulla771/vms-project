const accessControlService = require('../services/accessControlService');
const Notification = require('../models/Notification');
const IdempotencyKey = require('../models/IdempotencyKey');

/**
 * Helper to handle idempotency key checking and storage
 */
async function checkIdempotency(req) {
  const key = req.headers['idempotency-key'];
  if (!key) return null;

  const existing = await IdempotencyKey.findOne({ key });
  if (existing) {
    return existing.response;
  }
  return null;
}

async function saveIdempotency(req, responseData, statusCode = 200) {
  const key = req.headers['idempotency-key'];
  if (!key) return;

  try {
    await IdempotencyKey.create({
      key,
      path: req.originalUrl || req.path,
      method: req.method,
      statusCode,
      response: responseData,
      createdAt: new Date()
    });
  } catch (err) {
    // Ignore duplicate key race condition
  }
}

// 1. Assign Scope
exports.assignScope = async (req, res) => {
  try {
    const { userId, scopeType, scopeId, accessLevel, effectiveUntil, reason, replaceExisting } = req.body;
    const result = await accessControlService.assignScope({
      userId,
      scopeType,
      scopeId,
      accessLevel,
      effectiveUntil,
      adminUser: req.user,
      reason,
      replaceExisting
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 2. Transfer Scope
exports.transferScope = async (req, res) => {
  try {
    const { fromAssignmentId, toUserId, reason } = req.body;
    const result = await accessControlService.transferScope({
      fromAssignmentId,
      toUserId,
      adminUser: req.user,
      reason
    });
    res.json({ success: true, assignment: result });
  } catch (err) {
    const isConflict = err.message.includes('Conflict:');
    res.status(isConflict ? 409 : 400).json({ success: false, error: err.message });
  }
};

// 3. Unlink Scope
exports.unlinkScope = async (req, res) => {
  try {
    const { assignmentId, reason } = req.body;
    const result = await accessControlService.unlinkScope({
      assignmentId,
      adminUser: req.user,
      reason
    });
    res.json({ success: true, assignment: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 4. Bulk Assign Scopes
exports.bulkAssign = async (req, res) => {
  try {
    const cached = await checkIdempotency(req);
    if (cached) {
      return res.status(200).json(cached);
    }

    const { items, reason } = req.body;
    const result = await accessControlService.bulkAssignScopes({
      items,
      adminUser: req.user,
      reason
    });

    await saveIdempotency(req, { success: true, ...result });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 5. Bulk Deactivate Users
exports.bulkDeactivate = async (req, res) => {
  try {
    const cached = await checkIdempotency(req);
    if (cached) {
      return res.status(200).json(cached);
    }

    const { userIds, confirm, reason } = req.body;
    const result = await accessControlService.bulkDeactivateUsers({
      userIds,
      confirm,
      adminUser: req.user,
      reason
    });

    await saveIdempotency(req, { success: true, ...result });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 6. Get User Assignments (Self, Admin, or Manager)
exports.getUserAssignments = async (req, res) => {
  try {
    const { userId } = req.params;
    const assignments = await accessControlService.getUserAssignments(userId);
    res.json({ success: true, assignments });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 7. Get Scope Users (Admin or assigned Location Manager)
exports.getScopeUsers = async (req, res) => {
  try {
    const { scopeType, scopeId } = req.params;
    const users = await accessControlService.getScopeUsers(scopeType, scopeId);
    res.json({ success: true, users });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 8. Approve User Registration
exports.approveRegistration = async (req, res) => {
  try {
    const { userId, role, scopeAssignments, reason } = req.body;
    const result = await accessControlService.approveRegistration({
      userId,
      role,
      scopeAssignments,
      adminUser: req.user,
      reason
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 9. Reject User Registration
exports.rejectRegistration = async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const result = await accessControlService.rejectRegistration({
      userId,
      reason,
      adminUser: req.user
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 10. Deactivate Location
exports.deactivateLocation = async (req, res) => {
  try {
    const { scopeType, scopeId, reason } = req.body;
    const result = await accessControlService.deactivateLocation({
      scopeType,
      scopeId,
      adminUser: req.user,
      reason
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// 11. Admin Notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientRole: 'admin' })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('relatedUserId', 'username email role')
      .lean();
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 12. Mark Notification Read
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndUpdate(id, { read: true });
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
