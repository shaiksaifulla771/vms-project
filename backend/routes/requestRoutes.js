const express = require('express');
const {
  getRequests,
  getRequest,
  createRequest,
  updateRequest,
  approveOrRejectRequest,
  deleteRequest
} = require('../controllers/requestController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { verifyVendorExists, validatePayload } = require('../middleware/validate');

const router = express.Router();

router.route('/')
  .get(protect, getRequests)
  .post(
    protect,
    authorize('Admin', 'Manager', 'Planner'),
    validatePayload([
      { field: 'title', required: true, type: 'string' },
      { field: 'amount', required: true, type: 'number', min: 0 }
    ]),
    verifyVendorExists,
    createRequest
  );

router.route('/:id')
  .get(protect, getRequest)
  .put(protect, authorize('Admin', 'Manager', 'Planner'), updateRequest)
  .delete(protect, authorize('Admin', 'Manager'), deleteRequest);

router.patch('/:id/approve', protect, authorize('Admin', 'Manager'), approveOrRejectRequest);

module.exports = router;
