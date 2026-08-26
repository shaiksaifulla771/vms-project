const express = require('express');
const { register, login, getMe, verifyOtp, resendOtp, refresh, logout, revokeUser, registerSync, verifyEmailSync, migrateLegacy, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect, checkRole, authorize } = require('../middleware/authMiddleware');
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
router.post('/verify-email-sync', verifyEmailSync);
router.post('/migrate-legacy', loginLimiter, migrateLegacy);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/resend-otp', otpLimiter, resendOtp);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout); // Clears cookies reliably regardless of JWT expiry
router.post('/revoke/:userId', protect, authorize('Admin'), revokeUser);
router.get('/me', protect, getMe);

// QA Test Route for RBAC
router.get('/admin-only', protect, checkRole('Admin'), (req, res) => {
  res.status(200).json({ success: true, message: 'Welcome Admin' });
});

module.exports = router;
