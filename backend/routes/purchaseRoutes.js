const express = require('express');
const {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  approveOrRejectPO,
  receiveGoods
} = require('../controllers/purchaseController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getPurchaseOrders)
  .post(protect, authorize('Admin', 'Manager', 'Planner'), createPurchaseOrder);

router.get('/:id', protect, getPurchaseOrder);
router.patch('/:id/approve', protect, authorize('Admin', 'Manager'), approveOrRejectPO);
router.patch('/:id/receive', protect, authorize('Admin', 'Manager', 'Inventory Manager'), receiveGoods);

module.exports = router;
