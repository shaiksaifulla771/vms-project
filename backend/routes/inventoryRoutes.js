const express = require('express');
const {
  getInventoryBalances,
  getInventoryTransactions,
  getInventorySummary,
  syncMissingSiteReferences,
  createAdjustment,
  getLotStorageLedger,
  inwardStock,
  outwardStock,
  getLotsForMaterial
  getLotsForMaterial,
  transferLotStock,
  adjustLotStock
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
router.get('/lot-ledger', getLotStorageLedger);
router.get('/lots-for-material/:materialId', getLotsForMaterial);
router.post('/inward', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Inventory'), inwardStock);
router.post('/outward', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Inventory'), outwardStock);
router.post('/transfer', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Inventory'), transferLotStock);
router.post('/adjust-lot', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Inventory'), adjustLotStock);
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
