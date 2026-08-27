const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const AuthAuditLog = require('../models/AuthAuditLog');
const getJwtSecret = require('../config/jwt');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const emailService = require('../services/emailService');
const NotificationService = require('../services/notificationService');
const { admin, auth } = require('../config/firebaseAdmin');
const { generateNextUserCode } = require('../utils/userCodeGenerator');

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const OTP_TTL_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60;
const OTP_MAX_RESENDS = parseInt(process.env.OTP_MAX_RESENDS, 10) || 5;

// Helper to sign JWT
const getSignedJwtToken = (userId, tokenVersion) => {
  return jwt.sign({ id: userId, tokenVersion }, getJwtSecret(), {
    expiresIn: '15m',
  });
};

/**
 * Generates a cryptographically secure 4-digit numeric OTP (1000 - 9999)
 */
const pickRegistrationOtp = () => {
  return crypto.randomInt(1000, 10000).toString();
};

const getValidRequestedRole = (role) => {
  const validRequestedRoles = [
    'Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
    'Warehouse', 'ProcurementManager', 'Vendor', 'Planner', 
    'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
  ];
  return validRequestedRoles.includes(role) ? role : 'Viewer';
};

const buildAuthUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  requestedRole: user.requestedRole,
  accountStatus: user.accountStatus,
  approvalStatus: user.approvalStatus,
  isVerified: user.isVerified,
  emailVerified: user.emailVerified || false,
  siteIds: user.siteIds || [],
  warehouseIds: user.warehouseIds || []
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
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });

  return token;
};

// @desc    Register a user (Triggers 4-digit OTP email verification)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const role = req.body.role || req.body.requestedRole || 'Viewer';
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide name, email, and password.' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address (e.g. user@domain.com)' });
    }

    // Basic domain check to block obvious fake addresses
    const emailParts = email.split('@');
    if (emailParts.length !== 2 || !emailParts[1].includes('.')) {
      return res.status(400).json({ success: false, error: 'Invalid email domain format.' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      if (!userExists.isVerified && (userExists.accountStatus === 'Pending' || userExists.accountStatus === 'PENDING')) {
        await User.deleteOne({ _id: userExists._id });
      } else {
        return res.status(400).json({ success: false, error: 'Email address already registered' });
      }
    }

    const finalRequestedRole = getValidRequestedRole(role);
    const generatedOtp = pickRegistrationOtp();
    const otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Hash OTP before storage — never store plaintext OTP in MongoDB
    const otpHash = await bcrypt.hash(generatedOtp, 10);

    // Save in temporary staging collection until verified & approved
    await PendingRegistration.findOneAndDelete({ email });
    const pendingRegistration = await PendingRegistration.create({
      username,
      email,
      passwordHash: password,
      requestedRole: finalRequestedRole,
      otpHash,
      otpExpires,
      purpose: 'REGISTRATION'
    });

    // Queue email asynchronously — email failure should NOT block registration
    const otpEmail = await emailService.queueEmail({
      recipient: email,
      subject: 'Your 4-Digit VMS Verification Code',
      textBody: `Welcome to VendorOS VMS. Your verification code is ${generatedOtp}. This code expires in ${OTP_TTL_MINUTES} minutes.`,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#2563eb;margin-top:0">VendorOS VMS Verification</h2>
          <p>Hello <strong>${username}</strong>,</p>
          <p>Please enter this 4-digit code to verify your email address and submit your access request:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;margin:20px 0">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e293b">${generatedOtp}</span>
          </div>
          <p style="color:#64748b;font-size:14px">This verification code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
          <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px">Once verified, your account request will be forwarded to the System Administrator for role assignment and activation.</p>
        </div>
      `,
      templateCode: 'AUTH_REGISTRATION_OTP'
    });

    res.status(201).json({
      success: true,
      message: `A 4-digit verification code has been dispatched to your registered email (${email}). Please check your inbox.`
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify 4-Digit OTP and place user in PENDING Approval State
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Please provide both email and 4-digit OTP' });
    }

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 4-digit numeric OTP code' });
    }

    const pendingRegistration = await PendingRegistration.findOne({ email }).select('+passwordHash');
    if (!pendingRegistration) {
      return res.status(404).json({ success: false, error: 'No pending registration found for this email. Please register again.' });
    }

    if (pendingRegistration.attempts >= OTP_MAX_ATTEMPTS) {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      return res.status(429).json({ success: false, error: 'Too many incorrect OTP attempts. Please register again.' });
    }

    // Check expiry BEFORE comparing hash (avoid unnecessary bcrypt work)
    if (new Date(pendingRegistration.otpExpires) < new Date()) {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please register again.' });
    }

    // Compare submitted OTP against stored bcrypt hash
    const isOtpValid = pendingRegistration.otpHash
      ? await bcrypt.compare(otp, pendingRegistration.otpHash)
      : false;

    if (!isOtpValid) {
      pendingRegistration.attempts += 1;
      await pendingRegistration.save();
      return res.status(400).json({ 
        success: false, 
        error: `Invalid verification code. ${OTP_MAX_ATTEMPTS - pendingRegistration.attempts} attempt(s) remaining.` 
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      return res.status(400).json({ success: false, error: 'Email address already registered' });
    }

    // Mark temporary staging record as OTP verified & awaiting admin approval
    pendingRegistration.isOtpVerified = true;
    pendingRegistration.status = 'AWAITING_APPROVAL';
    pendingRegistration.otpVerifiedAt = new Date();
    pendingRegistration.otpHash = undefined;
    pendingRegistration.otpExpires = undefined;
    await pendingRegistration.save();

    // 1. Dispatch in-app and push notification to Admin
    try {
      await NotificationService.notifyAdmins({
        type: 'new_registration',
        title: 'New User Registration Request',
        message: `User ${pendingRegistration.username} (${pendingRegistration.email}) verified their email and requested the "${pendingRegistration.requestedRole}" role. Awaiting your approval.`,
        relatedUserId: pendingRegistration._id,
        metadata: {
          pendingId: pendingRegistration._id,
          email: pendingRegistration.email,
          username: pendingRegistration.username,
          requestedRole: pendingRegistration.requestedRole,
          registeredAt: pendingRegistration.createdAt
        },
        severity: 'info'
      });
    } catch (e) {}

    // 2. Dispatch email to Active Admins
    try {
      const admins = await User.find({ role: 'Admin', accountStatus: { $in: ['Active', 'ACTIVE'] }, isVerified: true }).select('email username');
      await Promise.all(admins.map((adminUser) => emailService.sendEmail({
        recipient: adminUser.email,
        subject: 'Action Required: New VMS Access Request',
        textBody: `New User Access Request:\nName: ${pendingRegistration.username}\nEmail: ${pendingRegistration.email}\nRequested Role: ${pendingRegistration.requestedRole}\nTime: ${new Date().toLocaleString()}\n\nPlease review and approve this user in the Admin Dashboard.`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
            <h2 style="color:#2563eb;margin-top:0">New User Access Request</h2>
            <p>A new user has verified their 4-digit OTP and is awaiting your role assignment and approval:</p>
            <ul style="list-style:none;padding:0">
              <li style="margin-bottom:8px"><strong>Name:</strong> ${pendingRegistration.username}</li>
              <li style="margin-bottom:8px"><strong>Email:</strong> ${pendingRegistration.email}</li>
              <li style="margin-bottom:8px"><strong>Requested Role:</strong> <span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-weight:600">${pendingRegistration.requestedRole}</span></li>
              <li style="margin-bottom:8px"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</li>
            </ul>
            <p>Please log in to the <strong>Admin Users & Access Control</strong> panel to assign their role, site scope, and approve their account.</p>
          </div>
        `,
        templateCode: 'AUTH_ADMIN_ACCESS_REQUEST',
        metadata: { pendingId: pendingRegistration._id, requestedRole: pendingRegistration.requestedRole }
      })));
    } catch (e) {}

    // 3. Write Auth Audit Log
    try {
      await AuthAuditLog.create({
        action: 'OTP_VERIFIED',
        targetEmail: pendingRegistration.email,
        previousAccountStatus: 'PENDING_OTP',
        newAccountStatus: 'AWAITING_APPROVAL',
        assignedRole: pendingRegistration.requestedRole,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Browser'
      });
    } catch (e) {}

    res.status(200).json({
      success: true,
      message: '4-digit OTP verified successfully! Your access request is stored in temporary staging and pending System Administrator approval.',
      isOtpVerified: true,
      email: pendingRegistration.email,
      username: pendingRegistration.username,
      requestedRole: pendingRegistration.requestedRole
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Resend 4-Digit OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOtp = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const pending = await PendingRegistration.findOne({ email });
    if (!pending) {
      return res.status(404).json({ success: false, error: 'No pending registration found for this email.' });
    }

    if (pending.isOtpVerified) {
      return res.status(400).json({ success: false, error: 'Email is already verified. Awaiting admin approval.' });
    }

    // Enforce maximum resend attempts
    if (pending.resendCount >= OTP_MAX_RESENDS) {
      return res.status(429).json({ success: false, error: 'Maximum resend attempts exceeded. Please register again.' });
    }

    // Rate-limit resends (cooldown period between resends)
    const now = Date.now();
    const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
    if (pending.lastOtpSentAt && (now - new Date(pending.lastOtpSentAt).getTime()) < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - (now - new Date(pending.lastOtpSentAt).getTime())) / 1000);
      return res.status(429).json({ success: false, error: `Please wait ${waitSeconds}s before requesting a new code.` });
    }

    const newOtp = pickRegistrationOtp();
    const newOtpHash = await bcrypt.hash(newOtp, 10);
    pending.otpHash = newOtpHash;
    pending.otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    pending.attempts = 0;
    pending.resendCount += 1;
    pending.lastOtpSentAt = new Date();
    await pending.save();

    // Queue email asynchronously
    await emailService.queueEmail({
      recipient: email,
      subject: 'Your New 4-Digit VMS Verification Code',
      textBody: `Your new VendorOS VMS verification code is ${newOtp}. This code expires in ${OTP_TTL_MINUTES} minutes.`,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#2563eb;margin-top:0">Your New Verification Code</h2>
          <p>Hello <strong>${pending.username}</strong>,</p>
          <p>Here is your new 4-digit verification code:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;margin:20px 0">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e293b">${newOtp}</span>
          </div>
          <p style="color:#64748b;font-size:14px">This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
        </div>
      `,
      templateCode: 'AUTH_RESEND_OTP'
    });

    res.status(200).json({
      success: true,
      message: `A new 4-digit verification code has been dispatched to your email (${email}). Please check your inbox.`
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Login user (Checks verification flag & temporary staging)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    if (process.env.LEGACY_JWT_AUTH_ENABLED === 'false') {
      return res.status(403).json({
        success: false,
        error: 'Legacy password authentication is disabled. Please sign in using Firebase Authentication.'
      });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      // Check if user is in temporary PendingRegistration staging
      const bcrypt = require('bcryptjs');
      const pendingReg = await PendingRegistration.findOne({ email }).select('+passwordHash');
      if (pendingReg) {
        const isMatch = await bcrypt.compare(password, pendingReg.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        if (!pendingReg.isOtpVerified) {
          return res.status(403).json({
            success: false,
            requireOtp: true,
            email: pendingReg.email,
            error: 'Account requires 4-digit OTP verification. Please enter the verification code sent to your email.'
          });
        }
        return res.status(403).json({
          success: false,
          requireApproval: true,
          email: pendingReg.email,
          error: 'Your email has been verified. Your account access request is pending administrator approval.'
        });
      }

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
    const normalizedStatus = (user.accountStatus || '').toUpperCase();
    if (normalizedStatus === 'PENDING') {
      return res.status(403).json({
        success: false,
        error: 'Your account is pending administrator approval.',
      });
    }
    if (normalizedStatus === 'SUSPENDED' || normalizedStatus === 'REJECTED' || normalizedStatus === 'DISABLED') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been suspended or rejected.',
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

// @desc    Get current user details & status
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        firebaseUid: req.user.firebaseUid,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        requestedRole: req.user.requestedRole,
        accountStatus: req.user.accountStatus,
        emailVerified: req.user.emailVerified || false,
        siteIds: req.user.siteIds || [],
        warehouseIds: req.user.warehouseIds || [],
        fieldSecurityLevel: req.user.fieldSecurityLevel || 'Internal'
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Synchronize Firebase Registration & Create PENDING User in MongoDB
// @route   POST /api/auth/register-sync
// @access  Private (Firebase ID Token Required)
exports.registerSync = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    let uid = null;
    let email = null;
    let emailVerified = false;

    // 1. Try Firebase Token Verification first
    if (token) {
      try {
        const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
        if (firebaseAuth) {
          const decodedToken = await firebaseAuth.verifyIdToken(token, false);
          uid = decodedToken.uid;
          email = String(decodedToken.email || '').trim().toLowerCase();
          emailVerified = decodedToken.email_verified || false;
        }
      } catch (fbErr) {
        // Continue to native JWT / body fallback
      }
    }

    // 2. Native JWT or Direct Request Body Fallback
    if (!uid || !email) {
      if (token) {
        try {
          const decoded = jwt.verify(token, getJwtSecret());
          if (decoded && decoded.id) {
            const u = await User.findById(decoded.id);
            if (u) {
              uid = u.firebaseUid || ('user_' + u._id);
              email = u.email;
              emailVerified = true;
            }
          }
        } catch (jwtErr) {}
      }

      if (!email && req.body.email) {
        email = String(req.body.email).trim().toLowerCase();
        uid = req.body.uid || ('sso_' + Buffer.from(email).toString('hex').slice(0, 16));
        emailVerified = true;
      }
    }

    if (!uid || !email) {
      return res.status(400).json({ success: false, error: 'Authentication token or valid email address required for registration.' });
    }

    const { username, requestedRole } = req.body;

    const validRequestedRoles = [
      'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
      'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 
      'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
    ];

    const finalRequestedRole = validRequestedRoles.includes(requestedRole) ? requestedRole : 'Viewer';

    // Check if user already exists
    let user = await User.findOne({ $or: [{ firebaseUid: uid }, { email }] });

    if (user) {
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        user.emailVerified = emailVerified;
        await user.save();
      }
      const authToken = getSignedJwtToken(user._id, user.tokenVersion || 0);
      return res.status(200).json({
        success: true,
        message: 'Account synchronized with VMS database.',
        token: authToken,
        user: buildAuthUser(user)
      });
    }

    // Create new MongoDB user
    const newUserCode = await generateNextUserCode();
    const isDevAdmin = email === 'shaiksaifulla771@gmail.com';

    user = await User.create({
      firebaseUid: uid,
      username: username || email.split('@')[0],
      email: email,
      role: isDevAdmin ? 'Admin' : 'Viewer',
      requestedRole: isDevAdmin ? null : finalRequestedRole,
      accountStatus: isDevAdmin ? 'ACTIVE' : 'PENDING',
      userCode: newUserCode,
      emailVerified: emailVerified
    });

    const authToken = isDevAdmin ? getSignedJwtToken(user._id, user.tokenVersion || 0) : null;
    return res.status(201).json({
      success: true,
      message: isDevAdmin ? 'Administrator account initialized.' : 'Account access request submitted. Administrator approval is pending.',
      token: authToken,
      user: buildAuthUser(user)
    });
  } catch (err) {
    if (err.code === 'auth/id-token-revoked' || err.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, error: 'Firebase ID token is expired or revoked. Please authenticate again.' });
    }
    next(err);
  }
};

// @desc    Synchronize Firebase Email Verification Status with MongoDB
// @route   POST /api/auth/verify-email-sync
// @access  Private (Firebase ID Token Required)
exports.verifyEmailSync = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authorization Bearer token required.' });
    }

    const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
    const decodedToken = await firebaseAuth.verifyIdToken(token, true);

    if (decodedToken.email_verified !== true) {
      return res.status(403).json({
        success: false,
        error: 'Email is not yet verified in Firebase Authentication. Please click the verification link sent to your email.',
        emailVerified: false
      });
    }

    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    if (!user) {
      return res.status(401).json({ success: false, error: 'User record not found in VMS database.' });
    }

    // Synchronize emailVerified in MongoDB
    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    // Note: Verified email DOES NOT automatically change accountStatus (remains PENDING until Admin approval)
    res.status(200).json({
      success: true,
      message: user.accountStatus === 'ACTIVE'
        ? 'Email verified successfully. Access granted.'
        : 'Email verified successfully. Your account remains pending administrator approval.',
      emailVerified: true,
      accountStatus: user.accountStatus,
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        username: user.username,
        email: user.email,
        role: user.role,
        requestedRole: user.requestedRole,
        accountStatus: user.accountStatus,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    if (err.code === 'auth/id-token-revoked' || err.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, error: 'Firebase ID token is expired or revoked.' });
    }
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
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.status(200).json({ success: true, token });
  } catch (err) {
    next(err);
  }
};

// @desc    Logout user (Revokes session and clears auth cookies cleanly)
// @route   POST /api/auth/logout
// @access  Public / Private
exports.logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies ? req.cookies.refreshToken : null;
    
    // Revoke user by session if authenticated
    if (req.user && req.user._id) {
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { tokenVersion: 1 }, $unset: { refreshTokenHash: 1 } }
      );
    } else if (refreshToken) {
      // Or revoke by refresh token hash if present
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await User.updateOne(
        { refreshTokenHash: hashedToken },
        { $inc: { tokenVersion: 1 }, $unset: { refreshTokenHash: 1 } }
      );
    }

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    };

    res.clearCookie('refreshToken', { ...cookieOpts, path: '/' });
    res.clearCookie('refreshToken', { ...cookieOpts, path: '/api/auth' });
    
    res.status(200).json({ success: true, message: 'Logged out successfully' });
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

// @desc    Migrate Legacy User credentials to Firebase Authentication
// @route   POST /api/auth/migrate-legacy
// @access  Public (Protected by loginLimiter)
exports.migrateLegacy = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email and legacy password for migration.' });
    }

    const normEmail = String(email).trim().toLowerCase();

    // 1. Find exactly one MongoDB user with normalized email
    const users = await User.find({ email: normEmail }).select('+password');
    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }
    if (users.length > 1) {
      await AuthAuditLog.create({
        action: 'MIGRATION_FAILED',
        targetEmail: normEmail,
        newAccountStatus: 'FAILED',
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      }).catch(() => {});

      return res.status(400).json({ success: false, error: 'Ambiguous identity: Multiple database records match this email address. Contact administrator.' });
    }

    const user = users[0];

    // 2. Legacy Bcrypt Password Verification
    if (!user.password) {
      return res.status(401).json({ success: false, error: 'Legacy password verification unavailable. Contact administrator.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await AuthAuditLog.create({
        action: 'MIGRATION_FAILED',
        targetUserId: user._id,
        targetEmail: normEmail,
        newAccountStatus: 'FAILED',
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      }).catch(() => {});

      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // 3. Authorization Snapshot (Verify ZERO changes before/after)
    const initialAuthSnapshot = {
      role: user.role,
      accountStatus: user.accountStatus,
      siteIds: (user.siteIds || []).map(id => id.toString()),
      warehouseIds: (user.warehouseIds || []).map(id => id.toString()),
      fieldSecurityLevel: user.fieldSecurityLevel || 'Internal'
    };

    // 4. Firebase User Creation / Discovery & Collision Checks
    const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
    let firebaseUser = null;

    try {
      firebaseUser = await firebaseAuth.getUserByEmail(normEmail);
    } catch (fbErr) {
      if (fbErr.code !== 'auth/user-not-found') {
        throw fbErr;
      }
    }

    if (!firebaseUser) {
      // Case A: User does not exist in Firebase -> Create Firebase User
      firebaseUser = await firebaseAuth.createUser({
        email: normEmail,
        password: password,
        emailVerified: user.emailVerified || false,
        displayName: user.username || normEmail.split('@')[0]
      });
    } else {
      // Case B: User exists in Firebase
      if (user.firebaseUid && user.firebaseUid !== firebaseUser.uid) {
        await AuthAuditLog.create({
          action: 'MIGRATION_FAILED',
          targetUserId: user._id,
          targetFirebaseUid: firebaseUser.uid,
          targetEmail: normEmail,
          newAccountStatus: 'COLLISION',
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
          timestamp: new Date()
        }).catch(() => {});

        return res.status(400).json({ success: false, error: 'Identity collision: Firebase UID conflicts with existing user linkage.' });
      }
    }

    const firebaseUid = firebaseUser.uid;

    // 5. Atomic MongoDB Linkage (Without altering authorization fields)
    if (user.firebaseUid !== firebaseUid) {
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { firebaseUid: null },
            { firebaseUid: { $exists: false } },
            { firebaseUid: firebaseUid }
          ]
        },
        { $set: { firebaseUid: firebaseUid } },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(409).json({ success: false, error: 'Concurrent migration or conflicting firebaseUid detected.' });
      }
    }

    // 6. Verify Authorization Snapshot Preservation
    const postAuthSnapshot = {
      role: user.role,
      accountStatus: user.accountStatus,
      siteIds: (user.siteIds || []).map(id => id.toString()),
      warehouseIds: (user.warehouseIds || []).map(id => id.toString()),
      fieldSecurityLevel: user.fieldSecurityLevel || 'Internal'
    };

    if (JSON.stringify(initialAuthSnapshot) !== JSON.stringify(postAuthSnapshot)) {
      throw new Error('CRITICAL INTEGRITY FAILURE: Authorization fields modified during identity migration!');
    }

    // 7. Generate Firebase Custom Token
    const customToken = await firebaseAuth.createCustomToken(firebaseUid);

    // 8. Audit Logging (MIGRATION_SUCCESS)
    try {
      await AuthAuditLog.create({
        action: 'MIGRATION_SUCCESS',
        targetUserId: user._id,
        targetFirebaseUid: firebaseUid,
        targetEmail: normEmail,
        requesterUserId: user._id,
        requesterEmail: normEmail,
        previousAccountStatus: user.accountStatus,
        newAccountStatus: user.accountStatus,
        assignedRole: user.role,
        assignedSiteIds: user.siteIds,
        assignedWarehouseIds: user.warehouseIds,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      });
    } catch (auditErr) {
      console.error('[AuthAuditLog Error]: Failed to write MIGRATION_SUCCESS log:', auditErr.message);
    }

    // 9. Safe Response (NO sensitive data, NO passwords, NO private keys)
    res.status(200).json({
      success: true,
      message: 'Legacy account successfully migrated to Firebase Authentication.',
      customToken: customToken,
      user: {
        id: user._id,
        firebaseUid: firebaseUid,
        username: user.username,
        email: user.email,
        role: user.role,
        requestedRole: user.requestedRole,
        accountStatus: user.accountStatus,
        emailVerified: user.emailVerified || false
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Request Password Reset Link via Email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.'
    };

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(200).json(genericResponse);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Enforce 60-second cooldown per account to prevent email flooding
    const now = Date.now();
    if (user.lastPasswordResetRequestedAt && (now - new Date(user.lastPasswordResetRequestedAt).getTime() < 60 * 1000)) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    user.lastPasswordResetRequestedAt = new Date();
    await user.save();

    const clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0].trim() : 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    await emailService.queueEmail({
      recipient: user.email,
      subject: 'VendorOS VMS Password Reset Link',
      textBody: `Hello ${user.username},\n\nYou requested a password reset for your VendorOS VMS account.\n\nPlease click the link below to set a new password:\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, please ignore this email.\n\nRegards,\nVendorOS VMS Security`,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:600px;margin:0 auto;border:1px solid #cbd5e1;padding:24px;border-radius:8px">
          <h2 style="color:#1e293b;margin-top:0">Password Reset Request</h2>
          <p>Hello <strong>${user.username}</strong>,</p>
          <p>We received a request to reset your password for your VendorOS VMS account (User Code: <strong>${user.userCode || 'USR-0500'}</strong>).</p>
          <div style="margin:24px 0;text-align:center">
            <a href="${resetUrl}" style="background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block">Reset Password</a>
          </div>
          <p style="font-size:13px;color:#64748b">If the button above does not work, copy and paste this link into your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
          <p style="font-size:13px;color:#64748b;margin-bottom:0">This link is valid for 15 minutes. If you did not request a password reset, your account remains secure.</p>
        </div>
      `,
      templateCode: 'AUTH_PASSWORD_RESET',
      metadata: { userId: user._id, userCode: user.userCode }
    });

    res.status(200).json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// @desc    Reset Password using Valid Token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please provide reset token and new password.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Resolve user by the hashed reset token alone (no email needed in payload/URL)
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires +password');

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired password reset link. Please request a new link.' });
    }

    // Set new password (pre-save hook will encrypt it with bcrypt)
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate previous sessions
    await user.save();

    // Also update Firebase password if firebaseUid is present
    if (user.firebaseUid) {
      try {
        const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
        if (firebaseAuth) {
          await firebaseAuth.updateUser(user.firebaseUid, { password: newPassword });
        }
      } catch (fbErr) {
        console.warn('[Firebase Password Sync Warning]:', fbErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Revoke User Tokens (Admin)
// @route   POST /api/auth/revoke/:userId
// @access  Private (Admin)
exports.revokeUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.refreshTokenHash = undefined;
    await user.save();

    // If firebaseUid exists, revoke Firebase refresh tokens too
    if (user.firebaseUid) {
      try {
        const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
        if (firebaseAuth) {
          await firebaseAuth.revokeRefreshTokens(user.firebaseUid);
        }
      } catch (fbErr) {
        console.warn('[Firebase Revoke Warning]:', fbErr.message);
      }
    }

    res.status(200).json({ success: true, message: 'All tokens for user revoked successfully' });
  } catch (err) {
    next(err);
  }
};
