const express = require('express');
const {
  executeMRPRun,
  getMRPRuns,
  getMRPRunById,
  convertRequirement,
} = require('../controllers/mrpController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/run', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), executeMRPRun);
router.get('/', getMRPRuns);
router.get('/runs/:id', getMRPRunById);
router.post('/requirements/:id/convert', authorize('Admin', 'Planner', 'Inventory Manager'), convertRequirement);

module.exports = router;
