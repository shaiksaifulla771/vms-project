const express = require('express');
const { getReportSummary, downloadPDFReport } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/summary', protect, getReportSummary);
router.get('/pdf', protect, downloadPDFReport);

module.exports = router;
