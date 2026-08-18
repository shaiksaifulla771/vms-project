const express = require('express');
const {
  getProductionPlans,
  getProductionPlanById,
  createManualPlan,
  createProductionPlan,
  createProductionPlanStrict,
  scheduleProductionPlan,
  rescheduleProductionPlan,
  materialCheckProductionPlan,
  approveProductionPlan,
  releaseProductionPlan,
  useProductionPlan,
  restoreProductionPlan,
  holdProductionPlan,
  cancelProductionPlan,
  completeProductionPlan,
  unscheduleProductionPlan,
  copyProductionPlan,
  splitProductionPlan,
} = require('../controllers/productionPlanController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getProductionPlans)
  .post(authorize('Admin', 'Production Manager', 'Planner'), createProductionPlan);

router.post('/manual', authorize('Admin', 'Production Manager', 'Planner'), createManualPlan);
router.post('/create', authorize('Admin', 'Production Manager', 'Planner'), createProductionPlanStrict);
router.post('/create-strict', authorize('Admin', 'Production Manager', 'Planner'), createProductionPlanStrict);

router
  .route('/:id')
  .get(getProductionPlanById);

router.post('/:id/schedule', authorize('Admin', 'Production Manager', 'Planner'), scheduleProductionPlan);
router.put('/:id/reschedule', authorize('Admin', 'Production Manager', 'Planner'), rescheduleProductionPlan);
router.post('/:id/material-check', authorize('Admin', 'Production Manager', 'Planner', 'Inventory Manager'), materialCheckProductionPlan);
router.post('/:id/approve', authorize('Admin', 'Production Manager', 'Planner'), approveProductionPlan);
router.post('/:id/release', authorize('Admin', 'Production Manager', 'Planner'), releaseProductionPlan);
router.post('/:id/use', authorize('Admin', 'Production Manager', 'Planner'), useProductionPlan);
router.post('/:id/restore', authorize('Admin', 'Production Manager', 'Planner'), restoreProductionPlan);
router.post('/:id/hold', authorize('Admin', 'Production Manager', 'Planner'), holdProductionPlan);
router.post('/:id/cancel', authorize('Admin', 'Production Manager', 'Planner'), cancelProductionPlan);
router.post('/:id/complete', authorize('Admin', 'Production Manager', 'Planner'), completeProductionPlan);
router.post('/:id/copy', authorize('Admin', 'Production Manager', 'Planner'), copyProductionPlan);
router.post('/:id/split', authorize('Admin', 'Production Manager', 'Planner'), splitProductionPlan);
router.post('/:id/unschedule', authorize('Admin', 'Production Manager', 'Planner'), unscheduleProductionPlan);

module.exports = router;


