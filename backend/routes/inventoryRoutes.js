const express = require('express');
const {
  getInventoryBalances,
  getInventoryTransactions,
  createAdjustment
} = require('../controllers/inventoryController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, getInventoryBalances);
router.get('/transactions', protect, getInventoryTransactions);
router.post('/adjustment', protect, createAdjustment);

module.exports = router;
