const express = require('express');
const { register, login, getMe, verifyOtp } = require('../controllers/authController');
const { protect, checkRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.get('/me', protect, getMe);

// QA Test Route for RBAC
router.get('/admin-only', protect, checkRole('Admin'), (req, res) => {
  res.status(200).json({ success: true, message: 'Welcome Admin' });
});

module.exports = router;
