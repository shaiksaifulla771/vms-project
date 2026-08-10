const express = require('express');
const {
  getStockTransfers,
  createStockTransfer,
  approveStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  rejectStockTransfer,
} = require('../controllers/stockTransferController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getStockTransfers)
  .post(createStockTransfer);

router.post('/:id/approve', approveStockTransfer);
router.post('/:id/dispatch', dispatchStockTransfer);
router.post('/:id/receive', receiveStockTransfer);
router.post('/:id/reject', rejectStockTransfer);

module.exports = router;
