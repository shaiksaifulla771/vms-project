const express = require('express');
const { getInspections, processQCInspection } = require('../controllers/qcController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/inspections', getInspections);
router.post('/inspections/:id/process', authorize('Admin', 'QC Inspector', 'Production Manager'), processQCInspection);

module.exports = router;
