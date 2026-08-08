const jwt = require('jsonwebtoken');
const User = require('../models/User');
const getJwtSecret = require('../config/jwt');

// Helper to sign JWT
const getSignedJwtToken = (userId) => {
  return jwt.sign({ id: userId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// @desc    Register a user (Triggers OTP verification)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ success: false, error: 'Please provide all details' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'Email address already registered' });
    }

    // Validate requested role against allowed roles
    const validRequestedRoles = ['Admin', 'Inventory', 'Production', 'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor'];
    let finalRequestedRole = validRequestedRoles.includes(role) ? role : 'Viewer';

    // Generate random 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes

    const user = await User.create({
      username,
      email,
      password,
      role: 'Viewer', // Hardcode default role
      requestedRole: finalRequestedRole, // Track what they asked for
      accountStatus: 'Pending', // Force pending state for Admin approval
      isVerified: false, // Force OTP verification
      otp: generatedOtp,
      otpExpires
    });

    // DO NOT issue a token during registration if they still need to OTP and be approved.
    // Instead return a success response instructing them to check their email.

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your OTP.',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        requestedRole: user.requestedRole,
        accountStatus: user.accountStatus
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify OTP and activate account
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Please specify email and OTP' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    // Validate OTP code and expiry
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, error: 'Invalid verification OTP code' });
    }

    if (new Date(user.otpExpires) < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification OTP code expired' });
    }

    // Activate user
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // We DO NOT issue a token if they are pending admin approval.
    // However, if they are already Active (e.g. they requested a new OTP after approval?), we can issue one.
    // The strict flow says: OTP verification -> Admin approval. So after OTP, they are still Pending.
    if (user.accountStatus === 'Pending') {
       return res.status(200).json({
         success: true,
         message: 'OTP verified successfully. Your account is now pending administrator approval.',
         user: {
           id: user._id,
           username: user.username,
           email: user.email,
           role: user.role,
           accountStatus: user.accountStatus
         }
       });
    }

    const token = getSignedJwtToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Login user (Checks verification flag)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check verification status (OTP)
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Account not verified. Please verify your OTP code.',
        requireVerification: true,
        email: user.email
      });
    }

    // Check account status (Admin Approval)
    if (user.accountStatus === 'Pending') {
      return res.status(403).json({
        success: false,
        error: 'Your account is pending administrator approval.',
      });
    }
    if (user.accountStatus === 'Suspended') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been suspended.',
      });
    }

    const token = getSignedJwtToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current user details
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        accountStatus: req.user.accountStatus
      },
    });
  } catch (err) {
    next(err);
  }
};
