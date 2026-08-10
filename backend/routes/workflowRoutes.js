const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(workflowController.getWorkflows)
  .post(authorize('Admin'), workflowController.createWorkflow);

router.route('/:id')
  .put(authorize('Admin'), workflowController.updateWorkflow)
  .delete(authorize('Admin'), workflowController.deleteWorkflow);

router.post('/:id/enable', authorize('Admin'), workflowController.enableWorkflow);
router.post('/:id/disable', authorize('Admin'), workflowController.disableWorkflow);
router.get('/executions/all', workflowController.getExecutions);
router.post('/execute', workflowController.executeWorkflow);

module.exports = router;
