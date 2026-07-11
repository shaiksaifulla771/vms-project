const express = require('express');
const {
  getProductionOrders,
  createProductionOrder,
  startProduction,
  completeProduction,
  getMRPPlanning
} = require('../controllers/productionController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getProductionOrders)
  .post(protect, createProductionOrder);

router.get('/planning/mrp', protect, getMRPPlanning);
router.patch('/:id/start', protect, startProduction);
router.patch('/:id/complete', protect, completeProduction);

module.exports = router;
