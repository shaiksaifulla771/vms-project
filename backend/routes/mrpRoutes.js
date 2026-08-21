const express = require('express');
const {
  previewMRP,
  executeMRPRun,
  getMRPRuns,
  getMRPHistory,
  getMRPRunById,
  getMRPResult,
  convertRequirement,
  bulkConvertRunRequirements,
  getMRPPlanningSummary,
  getPlanningExceptions,
  convertPurchaseRequirementToPO,
} = require('../controllers/mrpController');
const { protect, authorize, sanitizeCostData } = require('../middleware/authMiddleware');
const { validateMRPRun } = require('../validators/mrpValidator');

const router = express.Router();

router.use(protect);

// Planning Dashboard Summary & Aggregated Exceptions
router.get('/summary', sanitizeCostData, getMRPPlanningSummary);
router.get('/exceptions', sanitizeCostData, getPlanningExceptions);

// Dry-run preview calculation (zero DB mutation)
router.post('/preview', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), validateMRPRun, sanitizeCostData, previewMRP);

// Execute and commit a new MRP calculation run
router.post('/run', authorize('Admin', 'Planner', 'Inventory Manager', 'Production Manager'), validateMRPRun, sanitizeCostData, executeMRPRun);

// List all MRP runs (paginated via ?page=1&limit=50)
router.get('/', sanitizeCostData, getMRPRuns);
router.get('/runs', sanitizeCostData, getMRPRuns);
router.get('/history', sanitizeCostData, getMRPHistory);

// Get details of a specific run + its planning requirements & generated plans
router.get('/runs/:id', sanitizeCostData, getMRPRunById);
router.get('/result/:runId', sanitizeCostData, getMRPResult);

// Bulk-convert all pending shortages in a run
router.post('/runs/:id/bulk-convert', authorize('Admin', 'Planner', 'Inventory Manager'), bulkConvertRunRequirements);

// Convert a single planning requirement (to Plan or PR)
router.post('/requirements/:id/convert', authorize('Admin', 'Planner', 'Inventory Manager'), convertRequirement);

// Convert a Purchase Requirement directly to an actual Purchase Order
router.post('/purchase-requirements/:id/convert-to-po', authorize('Admin', 'Planner', 'Inventory Manager', 'ProcurementManager', 'Purchaser'), convertPurchaseRequirementToPO);

module.exports = router;
