const express = require('express');
const {
  getMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
} = require('../../controllers/pg/materialController');
const { protect, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.materials' RLS policies (docs/migrations/0006) gate every write
// (materials_admin_insert/update/delete) on get_auth_role() = 'admin' --
// there is no editor-level write tier for this table, so the route guard
// must match: an editor-gated route here would 403 at the API layer for a
// pure editor and 500 (RLS 42501) for anyone who slipped past it, since the
// two layers are meant to never disagree.
const router = express.Router();

router.route('/')
  .get(protect, getMaterials)
  .post(protect, requireAdmin, createMaterial);

router.route('/:id')
  .get(protect, getMaterial)
  .put(protect, requireAdmin, updateMaterial)
  .delete(protect, requireAdmin, deleteMaterial);

module.exports = router;
