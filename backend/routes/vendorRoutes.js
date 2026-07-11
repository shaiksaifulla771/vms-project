const express = require('express');
const {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  toggleVendorStatus,
  deleteVendor
} = require('../controllers/vendorController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getVendors)
  .post(protect, createVendor);

router.route('/:id')
  .get(protect, getVendor)
  .put(protect, updateVendor)
  .delete(protect, deleteVendor);

router.patch('/:id/status', protect, toggleVendorStatus);

module.exports = router;
