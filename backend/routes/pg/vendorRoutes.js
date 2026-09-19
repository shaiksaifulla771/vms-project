const express = require('express');
const {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
} = require('../../controllers/pg/vendorController');
const { protect, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.vendors' RLS policies gate every write (INSERT/UPDATE/DELETE) on
// get_auth_role() = 'admin' -- there is no editor-level write tier for this
// table, so the route guard must match: an editor-gated route here would
// 403 at the API layer for a pure editor and 500 (RLS 42501) for anyone who
// slipped past it, since the two layers are meant to never disagree.
const router = express.Router();

router.route('/')
  .get(protect, getVendors)
  .post(protect, requireAdmin, createVendor);

router.route('/:id')
  .get(protect, getVendor)
  .put(protect, requireAdmin, updateVendor)
  .delete(protect, requireAdmin, deleteVendor);

module.exports = router;
