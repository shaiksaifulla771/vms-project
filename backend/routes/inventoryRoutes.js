const express = require('express');
const {
  getInventoryBalances,
  getInventoryTransactions,
  createAdjustment
} = require('../controllers/inventoryController');

const {
  getAdjustments,
  createAdjustmentRequest,
  approveAdjustment,
  rejectAdjustment
} = require('../controllers/stockAdjustmentController');

const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getInventoryBalances);
router.get('/transactions', getInventoryTransactions);
router.get('/ledger', getInventoryTransactions);
router.post('/adjustment', createAdjustment);

// Stock adjustment approval routes
router.route('/adjustments')
  .get(getAdjustments)
  .post(createAdjustmentRequest);

router.post('/adjustments/:id/approve', approveAdjustment);
router.post('/adjustments/:id/reject', rejectAdjustment);

module.exports = router;
