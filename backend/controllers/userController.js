const User = require('../models/User');
const emailService = require('../services/emailService');

// @desc    Get all users (or filter by status/role)
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    const { status } = req.query;
    
    // Validate the authenticated user is actually an Admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
    }

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

// @desc    Approve user requested role
// @route   PUT /api/users/:id/approve
// @access  Private/Admin
exports.approveUser = async (req, res, next) => {
  try {
    // Validate the authenticated user is actually an Admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.accountStatus !== 'Pending') {
      return res.status(400).json({ success: false, error: 'Only pending accounts can be approved' });
    }

    // Assign the requested role or default to Viewer if null
    const newRole = user.requestedRole || 'Viewer';
    
    // Explicitly validate against the enum to prevent schema errors
    const validRoles = ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'];
    if (!validRoles.includes(newRole)) {
       return res.status(400).json({ success: false, error: 'Invalid requested role' });
    }

    user.role = newRole;
    user.accountStatus = 'Active';
    user.requestedRole = null; // Clear the request

    await user.save();

    await emailService.sendEmail({
      recipient: user.email,
      subject: 'Your VendorOS VMS access has been approved',
      textBody: `Hello ${user.username},\n\nYour VendorOS VMS access request has been approved. You can now log in with your registered email and password.\n\nAssigned role: ${newRole}\n\nRegards,\nVendorOS VMS Administration`,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>Access approved</h2>
          <p>Hello ${user.username},</p>
          <p>Your VendorOS VMS access request has been approved.</p>
          <p><strong>Assigned role:</strong> ${newRole}</p>
          <p>You can now log in with your registered email and password.</p>
          <p>Regards,<br/>VendorOS VMS Administration</p>
        </div>
      `,
      templateCode: 'AUTH_ACCESS_APPROVED',
      metadata: { userId: user._id, role: newRole }
    });

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus
      },
      message: `User approved and granted ${newRole} access.`
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
    // Validate the authenticated user is actually an Admin
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.accountStatus = 'Suspended';
    user.requestedRole = null; 

    await user.save();

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

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus
      },
      message: 'User rejected and suspended.'
    });
  } catch (err) {
    next(err);
  }
};
