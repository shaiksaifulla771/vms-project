const express = require('express');
const {
  getMpns,
  getMpn,
  createMpn,
  updateMpn,
  deleteMpn,
  getVendorPrices,
  addVendorPrice,
} = require('../../controllers/pg/mpnController');
const { protect, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.material_vendors' RLS policies gate every write (INSERT/UPDATE/
// DELETE) on get_auth_role() = 'admin' -- there is no editor-level write
// tier for this table. public.vendor_prices (child rows, FK
// material_vendor_id) gate INSERT/UPDATE/DELETE on admin as well, so the
// nested price-history routes use the same guard.
const router = express.Router();

router.route('/')
  .get(protect, getMpns)
  .post(protect, requireAdmin, createMpn);

router.route('/:id')
  .get(protect, getMpn)
  .put(protect, requireAdmin, updateMpn)
  .delete(protect, requireAdmin, deleteMpn);

router.route('/:id/prices')
  .get(protect, getVendorPrices)
  .post(protect, requireAdmin, addVendorPrice);

module.exports = router;
