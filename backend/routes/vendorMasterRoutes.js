const express = require('express');
const {
  checkDuplicate,
  getVendorMasters,
  createVendorMaster,
  updateVendorMaster,
  validateBatch,
  bulkUploadVendorMasters,
  softDeleteVendorMaster,
  restoreVendorMaster
} = require('../controllers/vendorMasterController');

const router = express.Router();

router.route('/check-duplicate')
  .post(checkDuplicate);

router.route('/validate-batch')
  .post(validateBatch);

router.route('/bulk')
  .post(bulkUploadVendorMasters);

router.route('/')
  .get(getVendorMasters)
  .post(createVendorMaster);

router.route('/:id')
  .put(updateVendorMaster)
  .delete(softDeleteVendorMaster);

router.route('/:id/restore')
  .patch(restoreVendorMaster);

module.exports = router;
