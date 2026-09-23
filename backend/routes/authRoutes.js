const express = require('express');
const {
  register,
  login,
  getMe,
  verifyOtp,
  resendOtp,
  refresh,
  logout,
  revokeUser,
  registerSync,
  verifyEmailSync,
  migrateLegacy,
  forgotPassword,
  resetPassword,
  generate2FA,
  verify2FA,
  validate2FA,
  disable2FA
} = require('../controllers/authController');
const { protect, checkRole, authorize, isAuthDisabled } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { loginLimiter, otpLimiter, registerLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Strict Anti-Caching Middleware for All Authentication Routes (Prevents 304 loops & stale auth state)
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

router.post('/register', registerLimiter, register);
router.post('/register-sync', registerLimiter, registerSync);
router.post('/verify-email-sync', registerLimiter, verifyEmailSync);
router.post('/migrate-legacy', loginLimiter, migrateLegacy);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/resend-otp', otpLimiter, resendOtp);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);
router.post('/login', loginLimiter, login);
router.post('/refresh', loginLimiter, refresh);
router.post('/logout', logout); // Clears cookies reliably regardless of JWT expiry
router.post('/revoke/:userId', protect, authorize('Admin'), revokeUser);
router.get('/me', protect, getMe);

// No-login mode: list ACTIVE users for the header "acting user" switcher
router.get('/acting-users', async (req, res, next) => {
  try {
    if (!isAuthDisabled()) return res.status(404).json({ success: false, error: 'Not available' });
    const users = await User.find({ accountStatus: { $in: ['ACTIVE', 'Active', 'APPROVED'] } })
      .select('username email role')
      .sort({ role: 1, username: 1 })
      .lean();
    res.json({ success: true, authDisabled: true, data: users.map(u => ({ id: u._id, username: u.username, email: u.email, role: u.role })) });
  } catch (err) {
    next(err);
  }
});

// Google Authenticator 2FA Routes
router.post('/2fa/generate', protect, otpLimiter, generate2FA);
router.post('/2fa/verify', protect, otpLimiter, verify2FA);
router.post('/2fa/validate', otpLimiter, validate2FA);
router.post('/2fa/disable', protect, otpLimiter, disable2FA);

// QA Test Route for RBAC
router.get('/admin-only', protect, checkRole('Admin'), (req, res) => {
  res.status(200).json({ success: true, message: 'Welcome Admin' });
});

module.exports = router;
