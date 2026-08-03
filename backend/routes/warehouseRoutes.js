const express = require('express');
const {
  getWarehouses,
  createWarehouse,
  getWarehouse,
  updateWarehouse
} = require('../controllers/warehouseController');

const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getWarehouses)
  .post(protect, createWarehouse);

router.route('/:id')
  .get(protect, getWarehouse)
  .put(protect, updateWarehouse);

module.exports = router;
