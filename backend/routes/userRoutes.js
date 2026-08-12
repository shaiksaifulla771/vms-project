const express = require('express');
const router = express.Router();
const { getUsers, approveUser, rejectUser } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All user management routes require Firebase authentication
router.use(protect);

router.get('/', authorize('Admin'), getUsers);
router.put('/:id/approve', authorize('Admin'), approveUser);
router.put('/:id/reject', authorize('Admin'), rejectUser);

module.exports = router;
