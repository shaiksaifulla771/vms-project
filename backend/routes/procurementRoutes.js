const express = require('express');
const {
  getPurchaseRequirements,
  updatePurchaseRequirementStatus,
  bulkConvertRequirements,
  evaluateReorders,
  createPurchaseRequestFromMRP,
} = require('../controllers/procurementController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Purchase Requirements lifecycle
router.get('/requirements', getPurchaseRequirements);
router.patch('/requirements/:id/status', authorize('Admin', 'Planner', 'Inventory Manager', 'ProcurementManager'), updatePurchaseRequirementStatus);
router.post('/requirements/bulk-convert', authorize('Admin', 'Planner', 'Inventory Manager', 'ProcurementManager'), bulkConvertRequirements);

// Automated Reorder Point Check
router.post('/reorder-check', authorize('Admin', 'Planner', 'Inventory Manager', 'ProcurementManager'), evaluateReorders);

// MRP purchase request creation
router.post('/create', authorize('Admin', 'Planner', 'Inventory Manager', 'ProcurementManager'), createPurchaseRequestFromMRP);

module.exports = router;
