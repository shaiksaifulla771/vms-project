const express = require('express');
const {
  getVendorPerformanceRatings,
  getVendorPerformanceRating,
  createVendorPerformanceRating,
} = require('../../controllers/pg/vendorPerformanceController');
const { protect, requireEditor } = require('../../middleware/supabaseAuthMiddleware');

// public.vendor_performance_ratings' RLS policies: SELECT any-authenticated;
// INSERT editor-or-admin+own(rated_by = auth.uid()); UPDATE none; DELETE
// none (append-only, no policy exists for either operation). There are
// deliberately no PUT/DELETE routes here -- building them would only ever
// produce a raw Postgres RLS violation (42501) instead of a clean 404/403,
// since no role at any rank can pass those operations.
const router = express.Router();

router.route('/')
  .get(protect, getVendorPerformanceRatings)
  .post(protect, requireEditor, createVendorPerformanceRating);

router.route('/:id')
  .get(protect, getVendorPerformanceRating);

module.exports = router;
