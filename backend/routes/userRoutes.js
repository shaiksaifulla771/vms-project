const express = require('express');
const router = express.Router();
const { getUsers, approveUser, rejectUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

router.get('/', getUsers);
router.put('/:id/approve', approveUser);
router.put('/:id/reject', rejectUser);

module.exports = router;
