const express = require('express');
const {
  getVendorContracts,
  getVendorContract,
  createVendorContract,
  updateVendorContract,
  deleteVendorContract,
} = require('../../controllers/pg/vendorContractController');
const { protect, requireEditor, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.vendor_contracts' RLS policies gate INSERT/UPDATE on
// get_auth_role() IN ('editor', 'admin') but DELETE on 'admin' only.
// requireEditor (rank-based, see supabaseAuthMiddleware.requireRole/ROLE_RANK)
// already means "editor or higher", so it also passes admins -- exactly
// matching "editor-or-admin".
const router = express.Router();

router.route('/')
  .get(protect, getVendorContracts)
  .post(protect, requireEditor, createVendorContract);

router.route('/:id')
  .get(protect, getVendorContract)
  .put(protect, requireEditor, updateVendorContract)
  .delete(protect, requireAdmin, deleteVendorContract);

module.exports = router;
