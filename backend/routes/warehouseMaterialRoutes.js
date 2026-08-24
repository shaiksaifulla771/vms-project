const express = require('express');
const {
  getAssignedMaterials,
  assignMaterialToWarehouse,
  updateAssignedMaterial,
  unassignMaterialFromWarehouse
} = require('../controllers/warehouseMaterialController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getAssignedMaterials);

// Only authorized roles can modify assignments
const assignmentRoles = ['Admin', 'Inventory Manager', 'Warehouse', 'Warehouse Operator'];

router.post('/assign', authorize(assignmentRoles), assignMaterialToWarehouse);

router.route('/:id')
  .put(authorize(assignmentRoles), updateAssignedMaterial)
  .delete(authorize(assignmentRoles), unassignMaterialFromWarehouse);

module.exports = router;
