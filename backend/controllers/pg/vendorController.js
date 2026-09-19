// Postgres/Prisma implementation for public.vendors, following the
// materialController.js reference pattern. Every query runs inside
// `req.withTransaction(fn)` -- opened per-call by supabaseAuthMiddleware.protect,
// running as the `authenticated` role with this caller's JWT claims set, so
// RLS on public.vendors is enforced by Postgres itself, not just by the
// requireAdmin gate on the route. The two checks read the same source of
// truth (public.get_auth_role()) and cannot disagree.
//
// RLS matrix (verified against pg_policies on the live database):
//   SELECT any-authenticated; INSERT admin+own(created_by); UPDATE admin; DELETE admin
const asyncHandler = require('../../middleware/asyncHandler');

exports.getVendors = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const vendors = await req.withTransaction((tx) =>
    tx.vendors.findMany({
      where: includeDeleted ? undefined : { deleted_at: null },
      orderBy: { name: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: vendors.length, data: vendors });
});

exports.getVendor = asyncHandler(async (req, res) => {
  const vendor = await req.withTransaction((tx) => tx.vendors.findUnique({ where: { id: req.params.id } }));
  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }
  res.status(200).json({ success: true, data: vendor });
});

exports.createVendor = asyncHandler(async (req, res) => {
  const {
    code,
    name,
    legal_name,
    status,
    contact_email,
    phone,
    gstin,
    pan,
    payment_terms_days,
    credit_limit,
    address_line1,
    address_line2,
    city,
    state,
    country,
    postal_code,
    notes,
  } = req.body;

  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'code and name are required' });
  }

  const vendor = await req.withTransaction((tx) =>
    tx.vendors.create({
      data: {
        code,
        name,
        legal_name: legal_name || null,
        status: status || 'DRAFT',
        contact_email: contact_email || null,
        phone: phone || null,
        gstin: gstin || null,
        pan: pan || null,
        payment_terms_days: payment_terms_days ?? 30,
        credit_limit: credit_limit ?? 0,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        state: state || null,
        country: country || null,
        postal_code: postal_code || null,
        notes: notes || null,
        created_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: vendor });
});

exports.updateVendor = asyncHandler(async (req, res) => {
  const {
    code,
    name,
    legal_name,
    status,
    contact_email,
    phone,
    gstin,
    pan,
    payment_terms_days,
    credit_limit,
    address_line1,
    address_line2,
    city,
    state,
    country,
    postal_code,
    notes,
  } = req.body;

  const vendor = await req.withTransaction(async (tx) => {
    const existing = await tx.vendors.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.vendors.update({
      where: { id: req.params.id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(legal_name !== undefined && { legal_name }),
        ...(status !== undefined && { status }),
        ...(contact_email !== undefined && { contact_email }),
        ...(phone !== undefined && { phone }),
        ...(gstin !== undefined && { gstin }),
        ...(pan !== undefined && { pan }),
        ...(payment_terms_days !== undefined && { payment_terms_days }),
        ...(credit_limit !== undefined && { credit_limit }),
        ...(address_line1 !== undefined && { address_line1 }),
        ...(address_line2 !== undefined && { address_line2 }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(country !== undefined && { country }),
        ...(postal_code !== undefined && { postal_code }),
        ...(notes !== undefined && { notes }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }
  res.status(200).json({ success: true, data: vendor });
});

// Soft-delete only -- public.vendors has deleted_at/deleted_by columns
// (see prisma/schema.prisma), matching the materials pattern.
exports.deleteVendor = asyncHandler(async (req, res) => {
  const vendor = await req.withTransaction(async (tx) => {
    const existing = await tx.vendors.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.vendors.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), deleted_by: req.user.id },
    });
  });

  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
