const express = require('express');
const {
  getWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require('../../controllers/pg/warehouseController');
const { protect, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.warehouses' RLS policies gate every write (warehouses_admin_insert/
// update/delete) on get_auth_role() = 'admin' -- there is no editor-level
// write tier for this table, so the route guard must match: an editor-gated
// route here would 403 at the API layer for a pure editor and 500 (RLS
// 42501) for anyone who slipped past it, since the two layers are meant to
// never disagree.
const router = express.Router();

router.route('/')
  .get(protect, getWarehouses)
  .post(protect, requireAdmin, createWarehouse);

router.route('/:id')
  .get(protect, getWarehouse)
  .put(protect, requireAdmin, updateWarehouse)
  .delete(protect, requireAdmin, deleteWarehouse);

module.exports = router;
