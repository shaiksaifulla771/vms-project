const express = require('express');
const router = express.Router();
const {
  getUsers,
  approveUser,
  rejectUser,
  getMyNotifications,
  markMyNotificationRead,
  markAllMyNotificationsRead
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All user management routes require authentication
router.use(protect);

router.get('/', authorize('Admin'), getUsers);
router.put('/:id/approve', authorize('Admin'), approveUser);
router.put('/:id/reject', authorize('Admin'), rejectUser);

// Notifications for current authenticated user
router.get('/notifications', getMyNotifications);
router.put('/notifications/:id/read', markMyNotificationRead);
router.put('/notifications/read-all', markAllMyNotificationsRead);

module.exports = router;

