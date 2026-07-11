const express = require('express');
const {
  getRequests,
  getRequest,
  createRequest,
  updateRequest,
  approveOrRejectRequest,
  deleteRequest
} = require('../controllers/requestController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getRequests)
  .post(protect, createRequest);

router.route('/:id')
  .get(protect, getRequest)
  .put(protect, updateRequest)
  .delete(protect, deleteRequest);

router.patch('/:id/approve', protect, approveOrRejectRequest);

module.exports = router;
