const express = require('express');
const {
  executeBatch,
  adjustDynamicIpOp,
  getBatches,
  getBatchById
} = require('../controllers/batchExecutionController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/execute', authorize('Admin', 'Production', 'Production Manager', 'Planner'), executeBatch);
router.put('/:id/dynamic-ip-op', authorize('Admin', 'Production', 'Production Manager'), adjustDynamicIpOp);
router.put('/:id/adjust-ip-op', authorize('Admin', 'Production', 'Production Manager'), adjustDynamicIpOp);
router.get('/', getBatches);
router.get('/:id', getBatchById);

module.exports = router;
