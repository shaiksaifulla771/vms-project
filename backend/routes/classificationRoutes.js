const express = require('express');
const {
  getClassifications,
  getClassification,
  createClassification,
  updateClassification,
  deleteClassification,
  getClassificationItems,
  getAvailableItems,
  linkItemsToClassification,
  unlinkItemsFromClassification,
  reassignClassificationItems,
  syncMasterDataEndpoint,
} = require('../controllers/classificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/sync-master-data', protect, authorize('Admin', 'Editor', 'Inventory Manager'), syncMasterDataEndpoint);

router.route('/')
  .get(protect, getClassifications)
  .post(protect, authorize('Admin', 'Editor', 'Inventory Manager'), createClassification);

router.route('/:id/items')
  .get(protect, getClassificationItems);

router.route('/:id/available-items')
  .get(protect, getAvailableItems);

router.route('/:id/link-items')
  .post(protect, authorize('Admin', 'Editor', 'Inventory Manager'), linkItemsToClassification);

router.route('/:id/unlink-items')
  .post(protect, authorize('Admin', 'Editor', 'Inventory Manager'), unlinkItemsFromClassification);

router.route('/:id/reassign-items')
  .post(protect, authorize('Admin', 'Editor', 'Inventory Manager'), reassignClassificationItems);

router.route('/:id')
  .get(protect, getClassification)
  .put(protect, authorize('Admin', 'Editor', 'Inventory Manager'), updateClassification)
  .delete(protect, authorize('Admin'), deleteClassification);

module.exports = router;
