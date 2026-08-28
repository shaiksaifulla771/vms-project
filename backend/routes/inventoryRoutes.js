const express = require('express');
const {
  getInventoryBalances,
  getInventoryTransactions,
  getInventorySummary,
  syncMissingSiteReferences,
  createAdjustment
} = require('../controllers/inventoryController');

const {
  getAdjustments,
  createAdjustmentRequest,
  approveAdjustment,
  rejectAdjustment
} = require('../controllers/stockAdjustmentController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getInventoryBalances);
router.get('/summary', getInventorySummary);
router.post('/sync-sites', authorize('Admin'), syncMissingSiteReferences);
router.get('/transactions', getInventoryTransactions);
router.get('/ledger', getInventoryTransactions);
router.post('/adjustment', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator'), createAdjustment);

// Stock adjustment approval routes
router.route('/adjustments')
  .get(getAdjustments)
  .post(authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Planner'), createAdjustmentRequest);

router.post('/adjustments/:id/approve', authorize('Admin', 'Inventory Manager', 'Manager'), approveAdjustment);
router.post('/adjustments/:id/reject', authorize('Admin', 'Inventory Manager', 'Manager'), rejectAdjustment);

module.exports = router;
