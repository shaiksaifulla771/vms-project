const express = require('express');
const {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  approveOrRejectPO,
  receiveGoods
} = require('../controllers/purchaseController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getPurchaseOrders)
  .post(protect, createPurchaseOrder);

router.get('/:id', protect, getPurchaseOrder);
router.patch('/:id/approve', protect, approveOrRejectPO);
router.patch('/:id/receive', protect, receiveGoods);

module.exports = router;
