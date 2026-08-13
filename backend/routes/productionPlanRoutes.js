const express = require('express');
const {
  getProductionPlans,
  getProductionPlanById,
  createProductionPlan,
  createProductionPlanStrict,
  scheduleProductionPlan,
  releaseProductionPlan,
  unscheduleProductionPlan,
  cancelProductionPlan,
  copyProductionPlan
} = require('../controllers/productionPlanController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getProductionPlans)
  .post(authorize('Admin', 'Production Manager', 'Planner'), createProductionPlan);

router.post('/create', authorize('Admin', 'Production Manager', 'Planner'), createProductionPlanStrict);
router.post('/create-strict', authorize('Admin', 'Production Manager', 'Planner'), createProductionPlanStrict);

router
  .route('/:id')
  .get(getProductionPlanById);

router.post('/:id/schedule', authorize('Admin', 'Production Manager', 'Planner'), scheduleProductionPlan);
router.post('/:id/copy', authorize('Admin', 'Production Manager', 'Planner'), copyProductionPlan);
router.post('/:id/release', authorize('Admin', 'Production Manager', 'Planner'), releaseProductionPlan);
router.post('/:id/unschedule', authorize('Admin', 'Production Manager', 'Planner'), unscheduleProductionPlan);
router.post('/:id/cancel', authorize('Admin', 'Production Manager', 'Planner'), cancelProductionPlan);

module.exports = router;
