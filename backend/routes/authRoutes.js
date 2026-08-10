const express = require('express');
const { register, login, getMe, verifyOtp, refresh, logout, revokeUser } = require('../controllers/authController');
const { protect, checkRole, authorize } = require('../middleware/authMiddleware');

const { loginLimiter, otpLimiter, registerLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', registerLimiter, register);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.post('/revoke/:userId', protect, authorize('Admin'), revokeUser);
router.get('/me', protect, getMe);

// QA Test Route for RBAC
router.get('/admin-only', protect, checkRole('Admin'), (req, res) => {
  res.status(200).json({ success: true, message: 'Welcome Admin' });
});

module.exports = router;
