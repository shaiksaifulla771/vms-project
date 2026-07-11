const express = require('express');
const {
  getRatings,
  createRating,
  getPerformanceAnalytics,
  getVendorPerformanceSummary
} = require('../controllers/performanceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getRatings)
  .post(protect, createRating);

router.get('/analytics', protect, getPerformanceAnalytics);
router.get('/vendor/:vendorId', protect, getVendorPerformanceSummary);

module.exports = router;
