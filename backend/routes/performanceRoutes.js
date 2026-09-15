const express = require('express');
const {
  getRatings,
  createRating,
  getPerformanceAnalytics,
  getVendorPerformanceSummary
} = require('../controllers/performanceController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getRatings)
  .post(protect, authorize('Admin', 'ProcurementManager', 'Purchaser', 'Buyer', 'Manager'), createRating);

router.get('/analytics', protect, getPerformanceAnalytics);
router.get('/vendor/:vendorId', protect, getVendorPerformanceSummary);

module.exports = router;
