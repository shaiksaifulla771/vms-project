const express = require('express');
const {
  getProductionPlans,
  getProductionPlanById,
  createProductionPlan,
  scheduleProductionPlan,
  unscheduleProductionPlan
} = require('../controllers/productionPlanController');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getProductionPlans)
  .post(authorize('Admin', 'Production Manager', 'Planner'), createProductionPlan);

router
  .route('/:id')
  .get(getProductionPlanById);

router.post('/:id/schedule', authorize('Admin', 'Production Manager', 'Planner'), scheduleProductionPlan);
router.post('/:id/unschedule', authorize('Admin', 'Production Manager', 'Planner'), unscheduleProductionPlan);

module.exports = router;
