const express = require('express');
const {
  checkDuplicate,
  getVendorMasters,
  createVendorMaster,
  updateVendorMaster,
  bulkUploadVendorMasters,
  softDeleteVendorMaster,
  restoreVendorMaster
} = require('../controllers/vendorMasterController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Secure all VMS dashboard routes

router.route('/')
  .get(getVendorMasters)
  .post(createVendorMaster);

router.route('/check-duplicate')
  .post(checkDuplicate);

router.route('/bulk')
  .post(bulkUploadVendorMasters);

router.route('/:id')
  .put(updateVendorMaster)
  .delete(softDeleteVendorMaster);

router.route('/:id/restore')
  .patch(restoreVendorMaster);

module.exports = router;
