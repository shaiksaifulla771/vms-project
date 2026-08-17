const express = require('express');
const {
  executeMRPRun,
  getMRPRuns,
  getMRPRunById,
  convertRequirement,
  bulkConvertRunRequirements,
} = require('../controllers/mrpController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Execute a new MRP calculation run
router.post('/run', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), executeMRPRun);

// List all MRP runs (paginated via ?page=1&limit=50)
router.get('/', getMRPRuns);

// Get details of a specific run + its planning requirements
router.get('/runs/:id', getMRPRunById);

// Bulk-convert all pending shortages in a run to PRs/Work Orders
router.post('/runs/:id/bulk-convert', authorize('Admin', 'Planner', 'Inventory Manager'), bulkConvertRunRequirements);

// Convert a single planning requirement
router.post('/requirements/:id/convert', authorize('Admin', 'Planner', 'Inventory Manager'), convertRequirement);

module.exports = router;
