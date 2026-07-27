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
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.route('/sequence-peek')
  .get(protect, peekNextVendorCode);

router.route('/next-code')
  .get(protect, getNextVendorCode);

router.route('/batch')
  .post(protect, createVendorsBatch);

router.route('/batch-upload')
  .post(protect, upload.single('file'), createVendorsBatchUpload);

router.route('/batch-delete-source')
  .post(protect, deleteVendorsBySource);

router.route('/batch-delete')
  .post(protect, batchDeleteVendors);

router.route('/')
  .get(protect, getVendors)
  .post(protect, createVendor);

router.route('/:id')
  .get(protect, getVendor)
  .put(protect, updateVendor)
  .delete(protect, deleteVendor);

module.exports = router;
