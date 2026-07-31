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
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.route('/batch')
  .post(protect, createMaterialsBatch);

router.route('/batch-upload')
  .post(protect, upload.single('file'), createMaterialsBatchUpload);

router.route('/batch-delete-source')
  .post(protect, deleteMaterialsBySource);

router.route('/batch-delete')
  .post(protect, batchDeleteMaterials);

router.route('/sequence-peek')
  .get(protect, peekNextMaterialCode);

router.route('/next-code')
  .get(protect, getNextMaterialCode);

router.route('/')
  .get(protect, getMaterials)
  .post(protect, createMaterial);

router.route('/:id')
  .get(protect, getMaterial)
  .put(protect, updateMaterial)
  .delete(protect, deleteMaterial);

module.exports = router;
