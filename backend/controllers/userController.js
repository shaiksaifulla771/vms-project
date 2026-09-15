const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuthAuditLog = require('../models/AuthAuditLog');
const UserAccessAssignment = require('../models/UserAccessAssignment');
const authz = require('../utils/authz');
const scopeResolver = require('../utils/scopeResolver');
const { invalidateUserStatusCache } = require('../middleware/authMiddleware');
const emailService = require('../services/emailService');
const NotificationService = require('../services/notificationService');
const { writeAuditLog } = require('../services/auditService');
const { generateNextUserCode } = require('../utils/userCodeGenerator');
const { eventBus, EVENTS } = require('../events/eventBus');
const mongoose = require('mongoose');

// @desc    Get all users (or filter by status/role) including staged pending registrations
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    if (!req.user || !authz.isGlobalAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
    }

    const { status } = req.query;
    let filter = {};
    if (status && status !== 'PENDING') {
      filter.accountStatus = status;
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const populatedUsers = await Promise.all(users.map(async (u) => {
      const { siteIds, warehouseIds } = await scopeResolver.getUserAssignedScopes(u);
      const sites = await Site.find({ _id: { $in: siteIds } }).select('name code').lean();
      const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } }).select('name code').lean();

      return {
        ...u,
        siteIds: sites,
        warehouseIds: warehouses
      };
    }));

    // Include temporary staged registrations if viewing all or filtering by PENDING
    let stagedPendingUsers = [];
    if (!status || status === 'PENDING') {
      const pendingRegs = await PendingRegistration.find({
        $or: [
          { isOtpVerified: true },
          { status: 'AWAITING_APPROVAL' }
        ]
      }).sort({ createdAt: -1 }).lean();

      stagedPendingUsers = pendingRegs.map(p => ({
        _id: p._id,
        username: p.username,
        email: p.email,
        role: p.requestedRole || 'Viewer',
        requestedRole: p.requestedRole || 'Viewer',
        accountStatus: 'PENDING',
        approvalStatus: 'PENDING',
        isVerified: true,
        emailVerified: true,
        isPendingRegistration: true,
        siteIds: [],
        warehouseIds: [],
        createdAt: p.createdAt
      }));
    }

    const allUsers = [...stagedPendingUsers, ...populatedUsers];

    res.status(200).json({
      success: true,
      count: allUsers.length,
      data: allUsers
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Approve user requested role, sites, and warehouses (Saves permanently to User collection)
// @route   PUT /api/users/:id/approve
// @access  Private/Admin
exports.approveUser = async (req, res, next) => {
  try {
    // 1. Authoritative Admin Role Check
    if (!req.user || req.user.role !== 'Admin' || (req.user.accountStatus || '').toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Access denied: Active Admin role required' });
    }

    // 2. Validate Target User ID format
    const targetUserId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    // 3. Self-Approval Protection
    if (req.user._id.toString() === targetUserId.toString()) {
      return res.status(400).json({ success: false, error: 'Administrators cannot approve their own account.' });
    }

    // 6. Role Validation (Admin can choose ANY valid enterprise role)
    const validRoles = [
      'Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
      'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 
      'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
    ];

    let newRole = req.body.role || 'Viewer';
    if (!validRoles.includes(newRole)) {
      newRole = 'Viewer';
    }

    // 7. Site Assignment Validation
    let validatedSiteIds = [];
    if (req.body.siteIds !== undefined) {
      if (!Array.isArray(req.body.siteIds)) {
        return res.status(400).json({ success: false, error: 'siteIds must be an array' });
      }
      for (const sId of req.body.siteIds) {
        if (!mongoose.Types.ObjectId.isValid(sId)) {
          return res.status(400).json({ success: false, error: `Invalid site ID format: ${sId}` });
        }
      }
      const existingSites = await Site.find({ _id: { $in: req.body.siteIds } });
      if (existingSites.length !== req.body.siteIds.length) {
        return res.status(400).json({ success: false, error: 'One or more site IDs do not exist in the database' });
      }
      validatedSiteIds = req.body.siteIds;
    }

    // 8. Warehouse Assignment Validation
    let validatedWarehouseIds = [];
    if (req.body.warehouseIds !== undefined) {
      if (!Array.isArray(req.body.warehouseIds)) {
        return res.status(400).json({ success: false, error: 'warehouseIds must be an array' });
      }
      for (const wId of req.body.warehouseIds) {
        if (!mongoose.Types.ObjectId.isValid(wId)) {
          return res.status(400).json({ success: false, error: `Invalid warehouse ID format: ${wId}` });
        }
      }
      const existingWarehouses = await Warehouse.find({ _id: { $in: req.body.warehouseIds } });
      if (existingWarehouses.length !== req.body.warehouseIds.length) {
        return res.status(400).json({ success: false, error: 'One or more warehouse IDs do not exist in the database' });
      }

      // Site / Warehouse Relationship Validation
      if (validatedSiteIds.length > 0) {
        const siteIdStrs = validatedSiteIds.map(id => id.toString());
        for (const wh of existingWarehouses) {
          if (wh.siteId && !siteIdStrs.includes(wh.siteId.toString())) {
            return res.status(400).json({ 
              success: false, 
              error: `Warehouse ${wh.code || wh.name} belongs to site ${wh.siteId} which is not in the assigned siteIds list` 
            });
          }
        }
      }
      validatedWarehouseIds = req.body.warehouseIds;
    }

    // Check if target is a staged PendingRegistration record
    const pendingRegistration = await PendingRegistration.findById(targetUserId).select('+passwordHash');
    if (pendingRegistration) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: pendingRegistration.email });
      if (existingUser) {
        await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
        return res.status(400).json({ success: false, error: 'User with this email is already registered.' });
      }

      const userCode = await generateNextUserCode();
      const updatedUser = await User.create({
        username: pendingRegistration.username,
        email: pendingRegistration.email,
        password: pendingRegistration.passwordHash,
        role: newRole,
        requestedRole: null,
        accountStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        userCode,
        isVerified: true,
        emailVerified: true,
        siteIds: validatedSiteIds,
        warehouseIds: validatedWarehouseIds
      });

      // Cleanup temporary staging record
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

      // Create assignments
      const newAssignments = [];
      for (const sId of validatedSiteIds) {
        if (sId) {
          newAssignments.push({
            userId: updatedUser._id,
            scopeType: 'site',
            scopeId: sId,
            status: 'active',
            assignedBy: req.user._id,
            assignedAt: new Date(),
            reason: 'Initial user approval scope assignment'
          });
        }
      }
      for (const wId of validatedWarehouseIds) {
        if (wId) {
          newAssignments.push({
            userId: updatedUser._id,
            scopeType: 'warehouse',
            scopeId: wId,
            status: 'active',
            assignedBy: req.user._id,
            assignedAt: new Date(),
            reason: 'Initial user approval scope assignment'
          });
        }
      }
      if (newAssignments.length > 0) {
        await UserAccessAssignment.insertMany(newAssignments);
      }

      invalidateUserStatusCache(updatedUser._id);

      // Audit Logging
      try {
        await AuthAuditLog.create({
          action: 'ACCOUNT_APPROVED',
          targetUserId: updatedUser._id,
          targetEmail: updatedUser.email,
          requesterUserId: req.user._id,
          requesterEmail: req.user.email,
          previousAccountStatus: 'PENDING_REGISTRATION',
          newAccountStatus: 'ACTIVE',
          assignedRole: updatedUser.role,
          assignedSiteIds: updatedUser.siteIds,
          assignedWarehouseIds: updatedUser.warehouseIds,
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
          timestamp: new Date()
        });
      } catch (auditErr) {
        console.error('[AuthAuditLog Error]: Failed to write ACCOUNT_APPROVED log:', auditErr.message);
      }

      // Notifications
      try {
        await NotificationService.notifyUser(updatedUser._id, {
          type: 'account_approved',
          title: 'Account Approved',
          message: `Your VMS account has been approved and activated with the role "${newRole}". You can now sign in.`,
          metadata: { role: newRole, approvedBy: req.user.username },
          severity: 'success'
        });
      } catch (e) {}

      // Emit ACCOUNT_APPROVED Domain Event (triggers event handler for email dispatch)
      try {
        const siteDocs = validatedSiteIds.length > 0 ? await Site.find({ _id: { $in: validatedSiteIds } }).select('name') : [];
        const whDocs = validatedWarehouseIds.length > 0 ? await Warehouse.find({ _id: { $in: validatedWarehouseIds } }).select('name code') : [];
        eventBus.emit(EVENTS.ACCOUNT_APPROVED, {
          userId: updatedUser._id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: newRole,
          siteNames: siteDocs.map(s => s.name),
          warehouseNames: whDocs.map(w => w.name || w.code),
          approvedByName: req.user.username
        });
      } catch (evtErr) {
        console.error('[EventBus Error]: Failed to emit ACCOUNT_APPROVED:', evtErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `User approved successfully and granted ${newRole} access.`,
        user: {
          id: updatedUser._id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          accountStatus: updatedUser.accountStatus,
          emailVerified: updatedUser.emailVerified || false,
          siteIds: updatedUser.siteIds,
          warehouseIds: updatedUser.warehouseIds
        }
      });
    }

    // Otherwise, handle existing User in User collection
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found in temporary staging or permanent records.' });
    }

    // 10. Atomic Approval Update for existing User document
    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, accountStatus: user.accountStatus },
      {
        $set: {
          accountStatus: 'ACTIVE',
          role: newRole,
          requestedRole: null,
          siteIds: validatedSiteIds,
          warehouseIds: validatedWarehouseIds
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(409).json({ success: false, error: 'Concurrent modification detected. Account status changed during approval.' });
    }

    // Sync UserAccessAssignment
    const newAssignments = [];
    for (const sId of validatedSiteIds) {
      if (sId) {
        newAssignments.push({
          userId: updatedUser._id,
          scopeType: 'site',
          scopeId: sId,
          status: 'active',
          assignedBy: req.user._id,
          assignedAt: new Date(),
          reason: 'Initial user approval scope assignment'
        });
      }
    }
    for (const wId of validatedWarehouseIds) {
      if (wId) {
        newAssignments.push({
          userId: updatedUser._id,
          scopeType: 'warehouse',
          scopeId: wId,
          status: 'active',
          assignedBy: req.user._id,
          assignedAt: new Date(),
          reason: 'Initial user approval scope assignment'
        });
      }
    }
    if (newAssignments.length > 0) {
      await UserAccessAssignment.insertMany(newAssignments);
    }

    invalidateUserStatusCache(updatedUser._id);

    // 11. Audit Logging
    try {
      await AuthAuditLog.create({
        action: 'ACCOUNT_APPROVED',
        targetUserId: updatedUser._id,
        targetFirebaseUid: updatedUser.firebaseUid,
        targetEmail: updatedUser.email,
        requesterUserId: req.user._id,
        requesterEmail: req.user.email,
        previousAccountStatus: user.accountStatus,
        newAccountStatus: 'ACTIVE',
        assignedRole: updatedUser.role,
        assignedSiteIds: updatedUser.siteIds,
        assignedWarehouseIds: updatedUser.warehouseIds,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      });
    } catch (auditErr) {
      console.error('[AuthAuditLog Error]: Failed to write ACCOUNT_APPROVED log:', auditErr.message);
    }

    // 12. Send Real-Time In-App & Push Notification
    try {
      await NotificationService.notifyUser(updatedUser._id, {
        type: 'account_approved',
        title: 'Account Approved',
        message: `Your VMS account has been approved and activated with the role "${newRole}". You can now sign in.`,
        metadata: { role: newRole, approvedBy: req.user.username },
        severity: 'success'
      });
    } catch (notifErr) {
      console.error('[NotificationService Error]:', notifErr.message);
    }

    // 13. Send Email Notification (non-blocking)
    // 13. Emit ACCOUNT_APPROVED Domain Event (triggers event handler for email dispatch)
    try {
      const siteDocs = await Site.find({ _id: { $in: updatedUser.siteIds || [] } }).select('name');
      const whDocs = await Warehouse.find({ _id: { $in: updatedUser.warehouseIds || [] } }).select('name code');
      eventBus.emit(EVENTS.ACCOUNT_APPROVED, {
        userId: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: newRole,
        siteNames: siteDocs.map(s => s.name),
        warehouseNames: whDocs.map(w => w.name || w.code),
        approvedByName: req.user.username
      });
    } catch (evtErr) {
      console.error('[EventBus Error]: Failed to emit ACCOUNT_APPROVED:', evtErr.message);
    }

    // 14. Safe Response (No sensitive data exposed)
    res.status(200).json({
      success: true,
      message: `User approved successfully and granted ${newRole} access.`,
      user: {
        id: updatedUser._id,
        firebaseUid: updatedUser.firebaseUid,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        requestedRole: updatedUser.requestedRole,
        accountStatus: updatedUser.accountStatus,
        emailVerified: updatedUser.emailVerified || false,
        siteIds: updatedUser.siteIds,
        warehouseIds: updatedUser.warehouseIds
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Reject/Suspend user
// @route   PUT /api/users/:id/reject
// @access  Private/Admin
exports.rejectUser = async (req, res, next) => {
  try {
    // 1. Authoritative Admin Role Check
    if (!req.user || req.user.role !== 'Admin' || (req.user.accountStatus || '').toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Access denied: Active Admin role required' });
    }

    // 2. Validate Target User ID format
    const targetUserId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    // 3. Self-Rejection Protection
    if (req.user._id.toString() === targetUserId.toString()) {
      return res.status(400).json({ success: false, error: 'Administrators cannot reject their own account.' });
    }

    // Check if target is a staged PendingRegistration record
    const pendingRegistration = await PendingRegistration.findById(targetUserId);
    if (pendingRegistration) {
      // 1. Emit ACCOUNT_REJECTED Domain Event
      try {
        eventBus.emit(EVENTS.ACCOUNT_REJECTED, {
          userId: pendingRegistration._id,
          username: pendingRegistration.username,
          email: pendingRegistration.email,
          reason: req.body.reason,
          rejectedByName: req.user.username
        });
      } catch (evtErr) {
        console.error('[EventBus Error]: Failed to emit ACCOUNT_REJECTED:', evtErr.message);
      }

      // 2. Audit Log
      try {
        await AuthAuditLog.create({
          action: 'REGISTRATION_REJECTED',
          targetEmail: pendingRegistration.email,
          requesterUserId: req.user._id,
          requesterEmail: req.user.email,
          previousAccountStatus: 'PENDING_REGISTRATION',
          newAccountStatus: 'PURGED',
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
          timestamp: new Date()
        });
      } catch (e) {}

      // 3. Purge/Delete from database completely
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

      return res.status(200).json({
        success: true,
        message: 'Registration request rejected and temporary data deleted from database.'
      });
    }

    // 4. Target User Existence Check
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found in temporary or permanent records' });
    }

    // 5. Audit Logging
    try {
      await AuthAuditLog.create({
        action: 'ACCOUNT_REJECTED',
        targetUserId: user._id,
        targetFirebaseUid: user.firebaseUid,
        targetEmail: user.email,
        requesterUserId: req.user._id,
        requesterEmail: req.user.email,
        previousAccountStatus: user.accountStatus,
        newAccountStatus: 'PURGED',
        assignedRole: user.role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      });
    } catch (auditErr) {
      console.error('[AuthAuditLog Error]: Failed to write ACCOUNT_REJECTED log:', auditErr.message);
    }

    // 6. Send Real-Time In-App & Push Notification
    try {
      await NotificationService.notifyUser(user._id, {
        type: 'account_rejected',
        title: 'Access Request Rejected',
        message: 'Your VMS access request was not approved by the administrator.',
        metadata: { rejectionReason: req.body.reason || 'Rejected by Administrator' },
        severity: 'warning'
      });
    } catch (notifErr) {
      console.error('[NotificationService Error]:', notifErr.message);
    }

    // 7. Send Email Notification (non-blocking)
    try {
      await emailService.sendEmail({
        recipient: user.email,
        subject: 'VendorOS VMS access request update',
        textBody: `Hello ${user.username},\n\nYour VendorOS VMS access request was not approved at this time. Please contact your administrator if you believe this was a mistake.\n\nRegards,\nVendorOS VMS Administration`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2>Access request update</h2>
            <p>Hello ${user.username},</p>
            <p>Your VendorOS VMS access request was not approved at this time.</p>
            <p>Please contact your administrator if you believe this was a mistake.</p>
            <p>Regards,<br/>VendorOS VMS Administration</p>
          </div>
        `,
        templateCode: 'AUTH_ACCESS_REJECTED',
        metadata: { userId: user._id }
      });
    } catch (emailErr) {
      console.error('[EmailService Error]: Notification sending failed:', emailErr.message);
    }

    // 8. Delete user completely from database
    await User.deleteOne({ _id: user._id });
    await UserAccessAssignment.deleteMany({ userId: user._id });

    // 9. Safe Response
    res.status(200).json({
      success: true,
      message: 'User request rejected and user deleted from database successfully.'
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current user / admin in-app notifications
// @route   GET /api/users/notifications
// @access  Private
exports.getMyNotifications = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const notifications = await NotificationService.getNotificationsForUser(req.user);
    res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark notification as read
// @route   PUT /api/users/notifications/:id/read
// @access  Private
exports.markMyNotificationRead = async (req, res, next) => {
  try {
    const updated = await NotificationService.markAsRead(req.params.id, req.user?._id);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/users/notifications/read-all
// @access  Private
exports.markAllMyNotificationsRead = async (req, res, next) => {
  try {
    await NotificationService.markAllAsRead(req.user);
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

