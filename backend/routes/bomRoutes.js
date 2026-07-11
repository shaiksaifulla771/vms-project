const express = require('express');
const {
  getBOMs,
  getBOM,
  createBOM,
  updateBOM,
  deleteBOM
} = require('../controllers/bomController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getBOMs)
  .post(protect, createBOM);

router.route('/:id')
  .get(protect, getBOM)
  .put(protect, updateBOM)
  .delete(protect, deleteBOM);

module.exports = router;
