const express = require('express');
const {
  getLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
} = require('../../controllers/pg/locationController');
const { protect, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.locations' RLS policies gate every write (locations_admin_insert/
// update/delete) on get_auth_role() = 'admin' -- there is no editor-level
// write tier for this table, so the route guard must match: an editor-gated
// route here would 403 at the API layer for a pure editor and 500 (RLS
// 42501) for anyone who slipped past it, since the two layers are meant to
// never disagree.
const router = express.Router();

router.route('/')
  .get(protect, getLocations)
  .post(protect, requireAdmin, createLocation);

router.route('/:id')
  .get(protect, getLocation)
  .put(protect, requireAdmin, updateLocation)
  .delete(protect, requireAdmin, deleteLocation);

module.exports = router;
