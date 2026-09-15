const express = require('express');
const {
  getContracts,
  getContract,
  createContract,
  updateContract,
  deleteContract
} = require('../controllers/contractController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { verifyVendorExists, validatePayload } = require('../middleware/validate');

const router = express.Router();

router.route('/')
  .get(protect, getContracts)
  .post(
    protect,
    authorize('Admin', 'Manager'),
    validatePayload([
      { field: 'title', required: true, type: 'string' },
      { field: 'value', required: true, type: 'number', min: 0 }
    ]),
    verifyVendorExists,
    createContract
  );

router.route('/:id')
  .get(protect, getContract)
  .put(protect, authorize('Admin', 'Manager'), updateContract)
  .delete(protect, authorize('Admin'), deleteContract);

module.exports = router;
