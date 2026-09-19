const express = require('express');
const {
  getVendorMasters,
  getVendorMaster,
  createVendorMaster,
  updateVendorMaster,
  deleteVendorMaster,
  getVendorMasterContacts,
  addVendorMasterContact,
  removeVendorMasterContact,
} = require('../../controllers/pg/vendorMasterController');
const { protect, requireEditor, requireAdmin } = require('../../middleware/supabaseAuthMiddleware');

// public.vendor_masters' RLS policies gate INSERT/UPDATE on
// get_auth_role() IN ('editor', 'admin') but DELETE on 'admin' only -- so
// unlike vendors, this table has an editor-level write tier for create/update,
// but delete is admin-only. public.vendor_master_contacts (child rows) gate
// INSERT/UPDATE/DELETE all on editor-or-admin. requireEditor (rank-based, see
// supabaseAuthMiddleware.requireRole/ROLE_RANK) already means "editor or
// higher", so it also passes admins -- exactly matching "editor-or-admin".
const router = express.Router();

router.route('/')
  .get(protect, getVendorMasters)
  .post(protect, requireEditor, createVendorMaster);

router.route('/:id')
  .get(protect, getVendorMaster)
  .put(protect, requireEditor, updateVendorMaster)
  .delete(protect, requireAdmin, deleteVendorMaster);

router.route('/:id/contacts')
  .get(protect, getVendorMasterContacts)
  .post(protect, requireEditor, addVendorMasterContact);

router.route('/:id/contacts/:contactId')
  .delete(protect, requireEditor, removeVendorMasterContact);

module.exports = router;
