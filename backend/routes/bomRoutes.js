const express = require('express');
const {
  getBOMs,
  getBOM,
  createBOM,
  updateBOM,
  deleteBOM,
  duplicateBOM,
  getBOMHistory
} = require('../controllers/bomController');
const { protect } = require('../middleware/authMiddleware');
const { validateBomRecipe } = require('../validators/bomValidator');

const router = express.Router();

router.route('/')
  .get(protect, getBOMs)
  .post(protect, validateBomRecipe, createBOM);

router.route('/:id')
  .get(protect, getBOM)
  .put(protect, validateBomRecipe, updateBOM)
  .delete(protect, deleteBOM);

router.post('/:id/duplicate', protect, duplicateBOM);
router.get('/:id/history', protect, getBOMHistory);

module.exports = router;
