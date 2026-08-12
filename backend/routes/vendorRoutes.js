const express = require('express');
const {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  peekNextVendorCode,
  getNextVendorCode,
  createVendorsBatch,
  createVendorsBatchUpload,
  deleteVendorsBySource,
  batchDeleteVendors
} = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.route('/sequence-peek')
  .get(protect, peekNextVendorCode);

router.route('/next-code')
  .get(protect, getNextVendorCode);

router.route('/batch')
  .post(protect, authorize('Admin', 'Manager'), createVendorsBatch);

router.route('/batch-upload')
  .post(protect, authorize('Admin', 'Manager'), upload.single('file'), createVendorsBatchUpload);

router.route('/batch-delete-source')
  .post(protect, authorize('Admin'), deleteVendorsBySource);

router.route('/batch-delete')
  .post(protect, authorize('Admin'), batchDeleteVendors);

router.route('/')
  .get(protect, getVendors)
  .post(protect, authorize('Admin', 'Manager'), createVendor);

router.route('/:id')
  .get(protect, getVendor)
  .put(protect, authorize('Admin', 'Manager'), updateVendor)
  .delete(protect, authorize('Admin'), deleteVendor);

module.exports = router;
