const express = require('express');
const {
  getProductionPlans,
  getProductionPlanById,
  createManualPlan,
  createProductionPlan,
  createProductionPlanStrict,
  updateProductionPlan,
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
  createWizardPlan,
  generatePlanInstances,
  getPlanInstances,
  validatePlan,
  submitForApproval,
  rejectProductionPlan,
  getReuseStaleness,
  reuseProductionPlan,
  addCustomMaterial,
  addSubstitution,
  getReusableTemplates,
  syncPlanProgress,
  matchProductionPlans,
  reverifyProductionPlan,
  overrideProductionPlan,
} = require('../controllers/productionPlanController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/templates', getReusableTemplates);
router.post('/match', authorize('Admin', 'Production Manager', 'Planner', 'Execution', 'Operator'), matchProductionPlans);
router.post('/wizard', authorize('Admin', 'Production Manager', 'Planner'), createWizardPlan);

router
  .route('/')
  .get(getProductionPlans)
  .post(authorize('Admin', 'Production Manager', 'Planner'), createProductionPlan);

router.post('/manual', authorize('Admin', 'Production Manager', 'Planner'), createManualPlan);
router.post('/create', authorize('Admin', 'Production Manager', 'Planner'), createProductionPlanStrict);
router.post('/create-strict', authorize('Admin', 'Production Manager', 'Planner'), createProductionPlanStrict);

router
  .route('/:id')
  .get(getProductionPlanById)
  .put(authorize('Admin', 'Production Manager', 'Planner'), updateProductionPlan)
  .patch(authorize('Admin', 'Production Manager', 'Planner'), updateProductionPlan);

router.get('/:id/instances', getPlanInstances);
router.post('/:id/instances', authorize('Admin', 'Production Manager', 'Planner'), generatePlanInstances);
router.post('/:id/validate', authorize('Admin', 'Production Manager', 'Planner'), validatePlan);
router.post('/:id/submit-approval', authorize('Admin', 'Production Manager', 'Planner'), submitForApproval);
router.post('/:id/reject', authorize('Admin', 'Production Manager', 'Planner'), rejectProductionPlan);
router.get('/:id/reuse-staleness', getReuseStaleness);
router.post('/:id/reuse', authorize('Admin', 'Production Manager', 'Planner'), reuseProductionPlan);
router.post('/:id/custom-material', authorize('Admin', 'Production Manager', 'Planner'), addCustomMaterial);
router.post('/:id/substitute-material', authorize('Admin', 'Production Manager', 'Planner'), addSubstitution);
router.post('/:id/sync-progress', authorize('Admin', 'Production Manager', 'Planner'), syncPlanProgress);

router.post('/:id/re-verify', authorize('Admin', 'Production Manager', 'Planner'), reverifyProductionPlan);
router.post('/:id/override', authorize('Admin', 'Production Manager', 'Approver', 'Manager'), overrideProductionPlan);

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
