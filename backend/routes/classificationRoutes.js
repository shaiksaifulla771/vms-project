const express = require('express');
const {
  getClassifications,
  getClassification,
  createClassification,
  updateClassification,
  deleteClassification,
} = require('../controllers/classificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getClassifications)
  .post(protect, authorize('Admin', 'Editor', 'Inventory Manager'), createClassification);

router.route('/:id')
  .get(protect, getClassification)
  .put(protect, authorize('Admin', 'Editor', 'Inventory Manager'), updateClassification)
  .delete(protect, authorize('Admin'), deleteClassification);

module.exports = router;
