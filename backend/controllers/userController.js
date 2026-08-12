const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuthAuditLog = require('../models/AuthAuditLog');
const emailService = require('../services/emailService');
const mongoose = require('mongoose');

// @desc    Get all users (or filter by status/role)
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
    }

    const { status } = req.query;
    let filter = {};
    if (status) {
      filter.accountStatus = status;
    }

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Approve user requested role, sites, and warehouses
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

    // 4. Target User Existence Check
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 5. Target Account Status Validation (PENDING only)
    const currentStatus = (user.accountStatus || '').toUpperCase();
    if (currentStatus !== 'PENDING') {
      return res.status(409).json({ 
        success: false, 
        error: `User account is already ${user.accountStatus}. Only PENDING accounts can be approved.`,
        currentStatus: user.accountStatus
      });
    }

    // 6. Role Validation
    const validRoles = [
      'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
      'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 
      'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
    ];

    let newRole = req.body.role || user.requestedRole;

    // Explicitly prohibit assigning Admin role via approval unless current architecture supports it
    if (newRole === 'Admin' || req.body.role === 'Admin') {
      return res.status(400).json({ success: false, error: 'Assigning Admin role via user approval is prohibited.' });
    }

    if (!newRole || !validRoles.includes(newRole)) {
      newRole = 'Viewer';
    }

    // 7. Site Assignment Validation
    let validatedSiteIds = user.siteIds || [];
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
    let validatedWarehouseIds = user.warehouseIds || [];
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

      // 9. Site / Warehouse Relationship Validation
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

    // 10. Atomic Approval Update
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

    // 12. Send Email Notification (non-blocking)
    try {
      await emailService.sendEmail({
        recipient: updatedUser.email,
        subject: 'Your VendorOS VMS access has been approved',
        textBody: `Hello ${updatedUser.username},\n\nYour VendorOS VMS access request has been approved. You can now access VMS services.\n\nAssigned role: ${newRole}\n\nRegards,\nVendorOS VMS Administration`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2>Access approved</h2>
            <p>Hello ${updatedUser.username},</p>
            <p>Your VendorOS VMS access request has been approved.</p>
            <p><strong>Assigned role:</strong> ${newRole}</p>
            <p>You can now log in and access your VMS workspace.</p>
            <p>Regards,<br/>VendorOS VMS Administration</p>
          </div>
        `,
        templateCode: 'AUTH_ACCESS_APPROVED',
        metadata: { userId: updatedUser._id, role: newRole }
      });
    } catch (emailErr) {
      console.error('[EmailService Error]: Notification sending failed:', emailErr.message);
    }

    // 13. Safe Response (No sensitive data exposed)
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

    // 4. Target User Existence Check
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 5. Target Account Status Validation (PENDING only)
    const currentStatus = (user.accountStatus || '').toUpperCase();
    if (currentStatus !== 'PENDING') {
      return res.status(409).json({ 
        success: false, 
        error: `User account is already ${user.accountStatus}. Only PENDING accounts can be rejected.`,
        currentStatus: user.accountStatus
      });
    }

    // 6. Atomic Rejection Update
    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, accountStatus: user.accountStatus },
      {
        $set: {
          accountStatus: 'REJECTED',
          requestedRole: null
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(409).json({ success: false, error: 'Concurrent modification detected. Account status changed during rejection.' });
    }

    // 7. Audit Logging
    try {
      await AuthAuditLog.create({
        action: 'ACCOUNT_REJECTED',
        targetUserId: updatedUser._id,
        targetFirebaseUid: updatedUser.firebaseUid,
        targetEmail: updatedUser.email,
        requesterUserId: req.user._id,
        requesterEmail: req.user.email,
        previousAccountStatus: user.accountStatus,
        newAccountStatus: 'REJECTED',
        assignedRole: updatedUser.role,
        assignedSiteIds: updatedUser.siteIds,
        assignedWarehouseIds: updatedUser.warehouseIds,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      });
    } catch (auditErr) {
      console.error('[AuthAuditLog Error]: Failed to write ACCOUNT_REJECTED log:', auditErr.message);
    }

    // 8. Send Email Notification (non-blocking)
    try {
      await emailService.sendEmail({
        recipient: updatedUser.email,
        subject: 'VendorOS VMS access request update',
        textBody: `Hello ${updatedUser.username},\n\nYour VendorOS VMS access request was not approved at this time. Please contact your administrator if you believe this was a mistake.\n\nRegards,\nVendorOS VMS Administration`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2>Access request update</h2>
            <p>Hello ${updatedUser.username},</p>
            <p>Your VendorOS VMS access request was not approved at this time.</p>
            <p>Please contact your administrator if you believe this was a mistake.</p>
            <p>Regards,<br/>VendorOS VMS Administration</p>
          </div>
        `,
        templateCode: 'AUTH_ACCESS_REJECTED',
        metadata: { userId: updatedUser._id }
      });
    } catch (emailErr) {
      console.error('[EmailService Error]: Notification sending failed:', emailErr.message);
    }

    // 9. Safe Response
    res.status(200).json({
      success: true,
      message: 'User request rejected successfully.',
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
