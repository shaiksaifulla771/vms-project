const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const getJwtSecret = require('../config/jwt');
const crypto = require('crypto');
const emailService = require('../services/emailService');

const EMAIL_REGEX = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/;
const OTP_TTL_MINUTES = 5;

// Helper to sign JWT
const getSignedJwtToken = (userId, tokenVersion) => {
  return jwt.sign({ id: userId, tokenVersion }, getJwtSecret(), {
    expiresIn: '15m',
  });
};

const generateOtpPool = () => {
  const codes = new Set();
  while (codes.size < 100) {
    codes.add(Math.floor(1000 + Math.random() * 9000).toString());
  }
  return Array.from(codes);
};

const pickRegistrationOtp = () => {
  const otpPool = generateOtpPool();
  return otpPool[crypto.randomInt(0, otpPool.length)];
};

const getValidRequestedRole = (role) => {
  const validRequestedRoles = ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'];
  return validRequestedRoles.includes(role) ? role : 'Viewer';
};

const buildAuthUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  requestedRole: user.requestedRole,
  accountStatus: user.accountStatus
});

const issueAuthTokens = async (res, user, req) => {
  const token = getSignedJwtToken(user._id, user.tokenVersion || 0);
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await User.updateOne(
    { _id: user._id },
    { $set: { refreshTokenHash, lastLoginAt: new Date(), lastLoginIp: req.ip } }
  );

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth'
  });

  return token;
};

// @desc    Register a user (Triggers OTP verification)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { username, password, role } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!username || !email || !password || !role) {
      return res.status(400).json({ success: false, error: 'Please provide all details' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      if (!userExists.isVerified && userExists.accountStatus === 'Pending') {
        await User.deleteOne({ _id: userExists._id });
      } else {
      return res.status(400).json({ success: false, error: 'Email address already registered' });
      }
    }

    const finalRequestedRole = getValidRequestedRole(role);

    const generatedOtp = pickRegistrationOtp();
    const otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await PendingRegistration.findOneAndDelete({ email });
    const pendingRegistration = await PendingRegistration.create({
      username,
      email,
      passwordHash: password,
      requestedRole: finalRequestedRole,
      otp: generatedOtp,
      otpExpires
    });

    const otpEmail = await emailService.sendEmail({
      recipient: email,
      subject: 'Your VendorOS VMS verification code',
      textBody: `Your VendorOS VMS verification code is ${generatedOtp}. This code expires in ${OTP_TTL_MINUTES} minutes.`,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>VendorOS VMS verification</h2>
          <p>Use this 4-digit code to verify your account:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px">${generatedOtp}</p>
          <p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>
        </div>
      `,
      templateCode: 'AUTH_REGISTRATION_OTP',
      metadata: { purpose: 'registration_otp', expiresAt: otpExpires }
    });

    if (otpEmail.status !== 'Sent') {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      return res.status(502).json({
        success: false,
        error: 'Registration could not be completed because the OTP email was not delivered. Please contact support or check SMTP configuration.',
        details: process.env.NODE_ENV === 'production' ? undefined : otpEmail.error
      });
    }

    const isConsoleOtp = otpEmail.metadata?.provider === 'console';
    const devOtpPayload = process.env.NODE_ENV === 'production' || !isConsoleOtp ? {} : { devOtp: generatedOtp };

    res.status(201).json({
      success: true,
      message: isConsoleOtp
        ? `Registration successful. Development email mode is active, so the OTP was logged on the backend console. It expires in ${OTP_TTL_MINUTES} minutes.`
        : `Registration successful. A 4-digit OTP has been sent to ${email}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      ...devOtpPayload,
      registration: {
        id: pendingRegistration._id,
        username: pendingRegistration.username,
        email: pendingRegistration.email,
        requestedRole: pendingRegistration.requestedRole,
        otpExpires: pendingRegistration.otpExpires
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
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Please specify email and OTP' });
    }

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 4-digit OTP code' });
    }

    const pendingRegistration = await PendingRegistration.findOne({ email }).select('+passwordHash');
    if (!pendingRegistration) {
      return res.status(404).json({ success: false, error: 'No pending registration found for this email. Please register again.' });
    }

    // Validate OTP code and expiry
    if (pendingRegistration.otp !== otp) {
      pendingRegistration.attempts += 1;
      await pendingRegistration.save();
      return res.status(400).json({ success: false, error: 'Invalid verification OTP code' });
    }

    if (new Date(pendingRegistration.otpExpires) < new Date()) {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      return res.status(400).json({ success: false, error: 'Verification OTP code expired' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      return res.status(400).json({ success: false, error: 'Email address already registered' });
    }

    const user = await User.create({
      username: pendingRegistration.username,
      email: pendingRegistration.email,
      password: pendingRegistration.passwordHash,
      role: 'Viewer',
      requestedRole: pendingRegistration.requestedRole,
      accountStatus: 'Pending',
      isVerified: true
    });

    await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

    const admins = await User.find({ role: 'Admin', accountStatus: 'Active', isVerified: true }).select('email username');
    await Promise.all(admins.map((admin) => emailService.sendEmail({
      recipient: admin.email,
      subject: 'New VendorOS VMS access request',
      textBody: `New access request:\nName: ${user.username}\nEmail: ${user.email}\nRequested role: ${user.requestedRole}\nDate/time: ${new Date().toLocaleString()}\nPlease approve or reject this request in Admin settings.`,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>New access request</h2>
          <p><strong>Name:</strong> ${user.username}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Requested role:</strong> ${user.requestedRole}</p>
          <p><strong>Date/time:</strong> ${new Date().toLocaleString()}</p>
          <p>Open VendorOS VMS Admin Settings to approve or reject this user.</p>
        </div>
      `,
      templateCode: 'AUTH_ADMIN_ACCESS_REQUEST',
      metadata: { userId: user._id, requestedRole: user.requestedRole }
    })));

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. Your access request is now pending administrator approval.',
      user: buildAuthUser(user)
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

    const token = await issueAuthTokens(res, user, req);

    res.status(200).json({
      success: true,
      token,
      user: buildAuthUser(user),
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

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
exports.refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies ? req.cookies.refreshToken : null;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Not authorized: missing refresh cookie' });
    }

    const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const user = await User.findOne({ refreshTokenHash: hashedToken });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authorized: invalid refresh token' });
    }

    const token = getSignedJwtToken(user._id, user.tokenVersion || 0);
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: newRefreshTokenHash } });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth'
    });

    res.status(200).json({ success: true, token });
  } catch (err) {
    next(err);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    if (req.user && req.user._id) {
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { tokenVersion: 1 }, $unset: { refreshTokenHash: 1 } }
      );
    }
    res.cookie('refreshToken', 'none', {
      expires: new Date(Date.now() + 5 * 1000),
      httpOnly: true,
      path: '/api/auth'
    });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Revoke user tokens
// @route   POST /api/auth/revoke/:userId
// @access  Admin
exports.revokeUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    await User.updateOne(
      { _id: user._id },
      { $inc: { tokenVersion: 1 }, $unset: { refreshTokenHash: 1 } }
    );
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};
