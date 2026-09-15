const express = require('express');
const {
  getStockTransfers,
  createStockTransfer,
  approveStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  rejectStockTransfer,
} = require('../controllers/stockTransferController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getStockTransfers)
  .post(authorize('Admin', 'Inventory Manager', 'Warehouse', 'Planner', 'Warehouse Operator'), createStockTransfer);

router.post('/:id/approve', authorize('Admin', 'Inventory Manager', 'Manager'), approveStockTransfer);
router.post('/:id/dispatch', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator'), dispatchStockTransfer);
router.post('/:id/receive', authorize('Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator'), receiveStockTransfer);
router.post('/:id/reject', authorize('Admin', 'Inventory Manager', 'Manager'), rejectStockTransfer);

module.exports = router;
