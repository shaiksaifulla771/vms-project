const express = require('express');
const {
  getBoms,
  getBom,
  createBom,
  updateBom,
  deleteBom,
  getBomItems,
  addBomItem,
  updateBomItem,
  deleteBomItem,
} = require('../../controllers/pg/bomController');
const { protect, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.boms' and public.bom_items' RLS policies (docs/migrations/0006)
// gate every write on get_auth_role() = 'admin' -- there is no editor-level
// write tier for either table, so the route guard must match: an
// editor-gated route here would 403 at the API layer for a pure editor and
// 500 (RLS 42501) for anyone who slipped past it, since the two layers are
// meant to never disagree.
const router = express.Router();

router.route('/')
  .get(protect, getBoms)
  .post(protect, requireAdmin, createBom);

router.route('/:id')
  .get(protect, getBom)
  .put(protect, requireAdmin, updateBom)
  .delete(protect, requireAdmin, deleteBom);

router.route('/:bomId/items')
  .get(protect, getBomItems)
  .post(protect, requireAdmin, addBomItem);

router.route('/:bomId/items/:itemId')
  .put(protect, requireAdmin, updateBomItem)
  .delete(protect, requireAdmin, deleteBomItem);

module.exports = router;
