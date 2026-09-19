// Postgres/Prisma implementation for public.vendor_masters and its child
// collection public.vendor_master_contacts, following the
// materialController.js reference pattern. Every query runs inside
// `req.withTransaction(fn)` so RLS enforces itself; route guards must match
// the RLS matrix exactly.
//
// RLS matrix (verified against pg_policies on the live database):
//   vendor_masters: SELECT any; INSERT editor-or-admin+own(created_by);
//                   UPDATE editor-or-admin; DELETE admin
//   vendor_master_contacts (child, FK vendor_master_id): SELECT any;
//                   INSERT editor-or-admin; UPDATE editor-or-admin;
//                   DELETE editor-or-admin
const asyncHandler = require('../../middleware/asyncHandler');

exports.getVendorMasters = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const vendorMasters = await req.withTransaction((tx) =>
    tx.vendor_masters.findMany({
      where: includeDeleted ? undefined : { deleted_at: null },
      orderBy: { company_name: 'asc' },
      include: { vendor_master_contacts: true },
    }),
  );
  res.status(200).json({ success: true, count: vendorMasters.length, data: vendorMasters });
});

exports.getVendorMaster = asyncHandler(async (req, res) => {
  const vendorMaster = await req.withTransaction((tx) =>
    tx.vendor_masters.findUnique({
      where: { id: req.params.id },
      include: { vendor_master_contacts: true },
    }),
  );
  if (!vendorMaster) {
    return res.status(404).json({ success: false, error: 'Vendor master not found' });
  }
  res.status(200).json({ success: true, data: vendorMaster });
});

exports.createVendorMaster = asyncHandler(async (req, res) => {
  const { vendor_id_code, company_name, tax_id, contact_email, department, role_title, status } = req.body;

  if (!vendor_id_code || !company_name || !tax_id || !contact_email) {
    return res
      .status(400)
      .json({ success: false, error: 'vendor_id_code, company_name, tax_id, and contact_email are required' });
  }

  const vendorMaster = await req.withTransaction((tx) =>
    tx.vendor_masters.create({
      data: {
        vendor_id_code,
        company_name,
        tax_id,
        contact_email,
        department: department || '',
        role_title: role_title || '',
        status: status || 'ACTIVE',
        created_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: vendorMaster });
});

exports.updateVendorMaster = asyncHandler(async (req, res) => {
  const { vendor_id_code, company_name, tax_id, contact_email, department, role_title, status } = req.body;

  const vendorMaster = await req.withTransaction(async (tx) => {
    const existing = await tx.vendor_masters.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.vendor_masters.update({
      where: { id: req.params.id },
      data: {
        ...(vendor_id_code !== undefined && { vendor_id_code }),
        ...(company_name !== undefined && { company_name }),
        ...(tax_id !== undefined && { tax_id }),
        ...(contact_email !== undefined && { contact_email }),
        ...(department !== undefined && { department }),
        ...(role_title !== undefined && { role_title }),
        ...(status !== undefined && { status }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!vendorMaster) {
    return res.status(404).json({ success: false, error: 'Vendor master not found' });
  }
  res.status(200).json({ success: true, data: vendorMaster });
});

// Soft-delete only -- public.vendor_masters has deleted_at/deleted_by
// columns (see prisma/schema.prisma), matching the materials pattern.
exports.deleteVendorMaster = asyncHandler(async (req, res) => {
  const vendorMaster = await req.withTransaction(async (tx) => {
    const existing = await tx.vendor_masters.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.vendor_masters.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), deleted_by: req.user.id },
    });
  });

  if (!vendorMaster) {
    return res.status(404).json({ success: false, error: 'Vendor master not found' });
  }
  res.status(200).json({ success: true, data: {} });
});

// ── vendor_master_contacts (child collection) ──────────────────────────────

exports.getVendorMasterContacts = asyncHandler(async (req, res) => {
  const parent = await req.withTransaction((tx) => tx.vendor_masters.findUnique({ where: { id: req.params.id } }));
  if (!parent) {
    return res.status(404).json({ success: false, error: 'Vendor master not found' });
  }
  const contacts = await req.withTransaction((tx) =>
    tx.vendor_master_contacts.findMany({
      where: { vendor_master_id: req.params.id },
      orderBy: { name: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: contacts.length, data: contacts });
});

exports.addVendorMasterContact = asyncHandler(async (req, res) => {
  const { name, phone, contact_role, department, email } = req.body;

  const contact = await req.withTransaction(async (tx) => {
    const parent = await tx.vendor_masters.findUnique({ where: { id: req.params.id } });
    if (!parent || parent.deleted_at) {
      return null;
    }
    return tx.vendor_master_contacts.create({
      data: {
        vendor_master_id: req.params.id,
        name: name || '',
        phone: phone || '',
        contact_role: contact_role || 'Other',
        department: department || 'Sourcing',
        email: email || '',
      },
    });
  });

  if (!contact) {
    return res.status(404).json({ success: false, error: 'Vendor master not found' });
  }
  res.status(201).json({ success: true, data: contact });
});

exports.removeVendorMasterContact = asyncHandler(async (req, res) => {
  const contact = await req.withTransaction(async (tx) => {
    const existing = await tx.vendor_master_contacts.findUnique({ where: { id: req.params.contactId } });
    if (!existing || existing.vendor_master_id !== req.params.id) {
      return null;
    }
    return tx.vendor_master_contacts.delete({ where: { id: req.params.contactId } });
  });

  if (!contact) {
    return res.status(404).json({ success: false, error: 'Vendor master contact not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
