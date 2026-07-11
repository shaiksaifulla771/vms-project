const express = require('express');
const {
  getContracts,
  getContract,
  createContract,
  updateContract,
  deleteContract
} = require('../controllers/contractController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getContracts)
  .post(protect, createContract);

router.route('/:id')
  .get(protect, getContract)
  .put(protect, updateContract)
  .delete(protect, deleteContract);

module.exports = router;
