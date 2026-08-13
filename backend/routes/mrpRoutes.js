const express = require('express');
const {
  executeMRPRun,
  calculateMRP,
  getMRPRuns,
  getMRPRunById,
  convertRequirement,
  bulkConvertRunRequirements,
} = require('../controllers/mrpController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/run', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), executeMRPRun);
router.post('/calculate', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), calculateMRP);
router.get('/', getMRPRuns);
router.get('/runs/:id', getMRPRunById);
router.post('/runs/:id/bulk-convert', authorize('Admin', 'Planner', 'Inventory Manager'), bulkConvertRunRequirements);
router.post('/requirements/:id/convert', authorize('Admin', 'Planner', 'Inventory Manager'), convertRequirement);

module.exports = router;
