const express = require('express');
const {
  getQualityRecords,
  inspectProduction
} = require('../controllers/qualityController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getQualityRecords)
  .post(protect, inspectProduction);

module.exports = router;
