const express = require('express');
const {
  getWarehouses,
  createWarehouse,
  getWarehouse,
  updateWarehouse
} = require('../controllers/warehouseController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getWarehouses)
  .post(protect, authorize('Admin'), createWarehouse);

router.route('/:id')
  .get(protect, getWarehouse)
  .put(protect, authorize('Admin', 'Manager'), updateWarehouse);

module.exports = router;
