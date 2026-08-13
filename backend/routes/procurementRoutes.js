const express = require('express');
const { createPurchaseRequestFromMRP } = require('../controllers/procurementController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/create', authorize('Admin', 'Planner', 'Inventory Manager', 'ProcurementManager'), createPurchaseRequestFromMRP);

module.exports = router;
