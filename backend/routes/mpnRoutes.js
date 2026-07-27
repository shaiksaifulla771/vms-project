const express = require('express');
const {
  getMPNs,
  getMPN,
  createMPN,
  updateMPN,
  deleteMPN,
  peekNextMPNCode,
  batchDeleteMPNs
} = require('../controllers/mpnController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/sequence-peek').get(protect, peekNextMPNCode);
router.route('/batch-delete').post(protect, batchDeleteMPNs);

router.route('/')
  .get(protect, getMPNs)
  .post(protect, createMPN);

router.route('/:id')
  .get(protect, getMPN)
  .put(protect, updateMPN)
  .delete(protect, deleteMPN);

module.exports = router;
