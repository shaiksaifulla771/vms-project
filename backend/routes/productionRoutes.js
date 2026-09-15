const express = require('express');
const {
  getProductionOrders,
  getProductionOrderById,
  createProductionOrder,
  submitForApproval,
  approveProductionOrder,
  allocateMaterial,
  startProduction,
  sendToQC,
  completeProduction,
  getMRPPlanning
} = require('../controllers/productionController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Planning
router.get('/planning/mrp', protect, getMRPPlanning);

// Core
router.route('/')
  .get(protect, getProductionOrders)
  .post(protect, authorize('Admin', 'Manager', 'Planner', 'Production Manager'), createProductionOrder);

router.route('/:id')
  .get(protect, getProductionOrderById);

// State Machine Transitions
router.post('/:id/submit', protect, submitForApproval);
router.post('/:id/approve', protect, authorize('Admin', 'Manager'), approveProductionOrder);
router.post('/:id/allocate', protect, authorize('Admin', 'Manager', 'Inventory Manager', 'Production Manager'), allocateMaterial);

// Support both POST and PATCH for start & complete transitions
router.post('/:id/start', protect, startProduction);
router.patch('/:id/start', protect, startProduction);

router.post('/:id/qc', protect, sendToQC);

router.post('/:id/complete', protect, completeProduction);
router.patch('/:id/complete', protect, completeProduction);

module.exports = router;
