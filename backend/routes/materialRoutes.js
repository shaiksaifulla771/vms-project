const express = require('express');
const {
  getMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  createMaterialsBatch,
  createMaterialsBatchUpload,
  deleteMaterialsBySource,
  batchDeleteMaterials,
  getNextMaterialCode,
  peekNextMaterialCode
} = require('../controllers/materialController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.route('/batch')
  .post(protect, authorize('Admin', 'Manager', 'Inventory Manager'), createMaterialsBatch);

router.route('/batch-upload')
  .post(protect, authorize('Admin', 'Manager', 'Inventory Manager'), upload.single('file'), createMaterialsBatchUpload);

router.route('/batch-delete-source')
  .post(protect, authorize('Admin'), deleteMaterialsBySource);

router.route('/batch-delete')
  .post(protect, authorize('Admin'), batchDeleteMaterials);

router.route('/sequence-peek')
  .get(protect, peekNextMaterialCode);

router.route('/next-code')
  .get(protect, getNextMaterialCode);

router.route('/')
  .get(protect, getMaterials)
  .post(protect, authorize('Admin', 'Manager', 'Inventory Manager'), createMaterial);

router.route('/:id')
  .get(protect, getMaterial)
  .put(protect, authorize('Admin', 'Manager', 'Inventory Manager'), updateMaterial)
  .delete(protect, authorize('Admin', 'Manager'), deleteMaterial);

module.exports = router;
