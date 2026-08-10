const express = require('express');
const {
  getSites,
  getSiteById,
  createSite,
  updateSite,
  getSiteInventorySummary,
} = require('../controllers/siteController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getSites)
  .post(authorize('Admin', 'Inventory Manager', 'Warehouse'), createSite);

router.route('/:id')
  .get(getSiteById)
  .put(authorize('Admin', 'Inventory Manager', 'Warehouse'), updateSite);

router.get('/:id/inventory-summary', getSiteInventorySummary);

module.exports = router;
