const express = require('express');
const {
  getMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  createMaterialsBatch,
  deleteMaterialsBySource
} = require('../controllers/materialController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/batch')
  .post(protect, createMaterialsBatch);

router.route('/batch-delete-source')
  .post(protect, deleteMaterialsBySource);

router.route('/')
  .get(protect, getMaterials)
  .post(protect, createMaterial);

router.route('/:id')
  .get(protect, getMaterial)
  .put(protect, updateMaterial)
  .delete(protect, deleteMaterial);

module.exports = router;
