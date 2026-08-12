const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const AuthAuditLog = require('../models/AuthAuditLog');
const getJwtSecret = require('../config/jwt');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const { admin, auth } = require('../config/firebaseAdmin');
const { generateNextUserCode } = require('../utils/userCodeGenerator');

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

    const newUserCode = await generateNextUserCode();
    const user = await User.create({
      username: pendingRegistration.username,
      email: pendingRegistration.email,
      password: pendingRegistration.passwordHash,
      role: 'Viewer',
      requestedRole: pendingRegistration.requestedRole,
      accountStatus: 'Pending',
      userCode: newUserCode,
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
    if (process.env.LEGACY_JWT_AUTH_ENABLED === 'false') {
      return res.status(403).json({
        success: false,
        error: 'Legacy password authentication is disabled. Please sign in using Firebase Authentication.'
      });
    }

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

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authorization Bearer token required for registration synchronization.' });
    }

    // 1. Verify Firebase ID token server-side
    const firebaseAuth = auth || (admin.auth ? admin.auth() : null);
    const decodedToken = await firebaseAuth.verifyIdToken(token, true);

    const uid = decodedToken.uid;
    const email = String(decodedToken.email || '').trim().toLowerCase();
    const { username, requestedRole } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ success: false, error: 'Firebase authentication token must contain a valid UID and email address.' });
    }

    // 2. Public Registration Guard: STRICTLY REJECT any attempt to request or assign 'Admin' role
    if (requestedRole === 'Admin' || req.body.role === 'Admin') {
      return res.status(400).json({
        success: false,
        error: 'Requesting Admin role via public registration is strictly prohibited. Admin access can only be granted by an authorized Administrator.'
      });
    }

    const validRequestedRoles = [
      'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
      'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 
      'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
    ];

    const finalRequestedRole = validRequestedRoles.includes(requestedRole) ? requestedRole : 'Viewer';

    // 3. Prevent duplicate Firebase UID associations
    const existingUidUser = await User.findOne({ firebaseUid: uid });
    if (existingUidUser) {
      return res.status(200).json({
        success: true,
        message: 'Account already synchronized with VMS database.',
        user: {
          id: existingUidUser._id,
          firebaseUid: existingUidUser.firebaseUid,
          username: existingUidUser.username,
          email: existingUidUser.email,
          role: existingUidUser.role,
          requestedRole: existingUidUser.requestedRole,
          accountStatus: existingUidUser.accountStatus,
          emailVerified: existingUidUser.emailVerified || false
        }
      });
    }

    // 4. Ambiguity and Duplicate Email Check
    const matchingEmailUsers = await User.find({ email });
    if (matchingEmailUsers.length > 1) {
      return res.status(400).json({
        success: false,
        error: 'Ambiguous identity detected: Multiple records match this email address. Please contact an Administrator for manual account reconciliation.'
      });
    }

    let user;
    if (matchingEmailUsers.length === 1) {
      user = matchingEmailUsers[0];
      if (user.firebaseUid && user.firebaseUid !== uid) {
        return res.status(400).json({
          success: false,
          error: 'Conflicting identity: This email is already associated with a different Firebase UID.'
        });
      }
      // Link unlinked user
      user.firebaseUid = uid;
      user.emailVerified = decodedToken.email_verified || false;
      await user.save();
    } else {
      // 5. Create new MongoDB User with accountStatus: 'PENDING'
      const newUserCode = await generateNextUserCode();
      user = await User.create({
        firebaseUid: uid,
        username: username || email.split('@')[0],
        email: email,
        role: 'Viewer',
        requestedRole: finalRequestedRole,
        accountStatus: 'PENDING',
        userCode: newUserCode,
        emailVerified: decodedToken.email_verified || false
      });
    }

    res.status(201).json({
      success: true,
      message: 'Registration synchronized successfully. Your access request is now pending administrator approval.',
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
    if (!email) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email address, a password reset link has been dispatched to your inbox.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    await emailService.sendEmail({
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

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email address, a password reset link has been dispatched to your inbox.'
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Reset Password using Valid Token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please provide email, reset token, and new password.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires +password');

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired password reset link. Please request a new link.' });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
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
