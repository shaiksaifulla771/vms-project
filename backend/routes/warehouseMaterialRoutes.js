const express = require('express');
const {
  getAssignedMaterials,
  assignMaterialToWarehouse,
  updateAssignedMaterial,
  unassignMaterialFromWarehouse
} = require('../controllers/warehouseMaterialController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getAssignedMaterials);

router.post('/assign', assignMaterialToWarehouse);

router.route('/:id')
  .put(updateAssignedMaterial)
  .delete(unassignMaterialFromWarehouse);

module.exports = router;
