const express = require('express');
const {
  getQualityRecords,
  inspectProduction
} = require('../controllers/qualityController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getQualityRecords)
  .post(protect, authorize('Admin', 'QC Inspector', 'Production Manager'), inspectProduction);

module.exports = router;
