const express = require('express');
const {
  executeMRPRun,
  getMRPRuns,
  getMRPHistory,
  getMRPRunById,
  getMRPResult,
  convertRequirement,
  bulkConvertRunRequirements,
  getMRPPlanningSummary,
  getPlanningExceptions,
} = require('../controllers/mrpController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Planning Dashboard Summary & Aggregated Exceptions
router.get('/summary', getMRPPlanningSummary);
router.get('/exceptions', getPlanningExceptions);

// Execute a new MRP calculation run
router.post('/run', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), executeMRPRun);

// List all MRP runs (paginated via ?page=1&limit=50)
router.get('/', getMRPRuns);
router.get('/history', getMRPHistory);

// Get details of a specific run + its planning requirements & generated plans
router.get('/runs/:id', getMRPRunById);
router.get('/result/:runId', getMRPResult);

// Bulk-convert all pending shortages in a run
router.post('/runs/:id/bulk-convert', authorize('Admin', 'Planner', 'Inventory Manager'), bulkConvertRunRequirements);

// Convert a single planning requirement
router.post('/requirements/:id/convert', authorize('Admin', 'Planner', 'Inventory Manager'), convertRequirement);

module.exports = router;

