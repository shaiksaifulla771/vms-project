// Postgres/Prisma implementation for public.material_vendors (the MPN /
// material-vendor mapping table) and its child collection
// public.vendor_prices (effective-dated price history), following the
// materialController.js reference pattern. Every query runs inside
// `req.withTransaction(fn)` so RLS enforces itself.
//
// RLS matrix (verified against pg_policies on the live database):
//   material_vendors: SELECT any; INSERT admin+own(created_by); UPDATE admin;
//                      DELETE admin
//   vendor_prices (child, FK material_vendor_id): SELECT any;
//                      INSERT admin+own(created_by); UPDATE admin; DELETE admin
const asyncHandler = require('../../middleware/asyncHandler');

exports.getMpns = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const mpns = await req.withTransaction((tx) =>
    tx.material_vendors.findMany({
      where: includeDeleted ? undefined : { deleted_at: null },
      orderBy: { mpn_code: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: mpns.length, data: mpns });
});

exports.getMpn = asyncHandler(async (req, res) => {
  const mpn = await req.withTransaction((tx) => tx.material_vendors.findUnique({ where: { id: req.params.id } }));
  if (!mpn) {
    return res.status(404).json({ success: false, error: 'MPN not found' });
  }
  res.status(200).json({ success: true, data: mpn });
});

exports.createMpn = asyncHandler(async (req, res) => {
  const {
    material_id,
    vendor_id,
    mpn_code,
    specifications,
    certifications,
    is_hazardous,
    purchase_approved,
    is_preferred,
    moq,
    lead_time_days,
    status,
  } = req.body;

  if (!material_id || !vendor_id || !mpn_code) {
    return res.status(400).json({ success: false, error: 'material_id, vendor_id, and mpn_code are required' });
  }

  const mpn = await req.withTransaction((tx) =>
    tx.material_vendors.create({
      data: {
        material_id,
        vendor_id,
        mpn_code,
        specifications: specifications ?? {},
        certifications: certifications ?? [],
        is_hazardous: is_hazardous ?? false,
        purchase_approved: purchase_approved ?? true,
        is_preferred: is_preferred ?? false,
        moq: moq ?? 1,
        lead_time_days: lead_time_days ?? 7,
        status: status || 'ACTIVE',
        created_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: mpn });
});

exports.updateMpn = asyncHandler(async (req, res) => {
  const {
    material_id,
    vendor_id,
    mpn_code,
    specifications,
    certifications,
    is_hazardous,
    purchase_approved,
    is_preferred,
    moq,
    lead_time_days,
    status,
  } = req.body;

  const mpn = await req.withTransaction(async (tx) => {
    const existing = await tx.material_vendors.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.material_vendors.update({
      where: { id: req.params.id },
      data: {
        ...(material_id !== undefined && { material_id }),
        ...(vendor_id !== undefined && { vendor_id }),
        ...(mpn_code !== undefined && { mpn_code }),
        ...(specifications !== undefined && { specifications }),
        ...(certifications !== undefined && { certifications }),
        ...(is_hazardous !== undefined && { is_hazardous }),
        ...(purchase_approved !== undefined && { purchase_approved }),
        ...(is_preferred !== undefined && { is_preferred }),
        ...(moq !== undefined && { moq }),
        ...(lead_time_days !== undefined && { lead_time_days }),
        ...(status !== undefined && { status }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!mpn) {
    return res.status(404).json({ success: false, error: 'MPN not found' });
  }
  res.status(200).json({ success: true, data: mpn });
});

// Soft-delete only -- public.material_vendors has deleted_at/deleted_by
// columns (see prisma/schema.prisma), matching the materials pattern.
exports.deleteMpn = asyncHandler(async (req, res) => {
  const mpn = await req.withTransaction(async (tx) => {
    const existing = await tx.material_vendors.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.material_vendors.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), deleted_by: req.user.id },
    });
  });

  if (!mpn) {
    return res.status(404).json({ success: false, error: 'MPN not found' });
  }
  res.status(200).json({ success: true, data: {} });
});

// ── vendor_prices (child collection: effective-dated price history) ───────
// List + create only, per the RLS matrix -- UPDATE/DELETE are admin-gated
// too, but this domain's price history is treated as append-only from the
// API surface (new price rows supersede old ones via valid_to), matching
// the MPN pricing behavior in the old Mongoose controller.

exports.getVendorPrices = asyncHandler(async (req, res) => {
  const parent = await req.withTransaction((tx) => tx.material_vendors.findUnique({ where: { id: req.params.id } }));
  if (!parent) {
    return res.status(404).json({ success: false, error: 'MPN not found' });
  }
  const prices = await req.withTransaction((tx) =>
    tx.vendor_prices.findMany({
      where: { material_vendor_id: req.params.id },
      orderBy: { valid_from: 'desc' },
    }),
  );
  res.status(200).json({ success: true, count: prices.length, data: prices });
});

exports.addVendorPrice = asyncHandler(async (req, res) => {
  const { currency, unit_price, min_order_qty, valid_from, valid_to, source, notes } = req.body;

  if (unit_price === undefined || !valid_from) {
    return res.status(400).json({ success: false, error: 'unit_price and valid_from are required' });
  }

  const price = await req.withTransaction(async (tx) => {
    const parent = await tx.material_vendors.findUnique({ where: { id: req.params.id } });
    if (!parent || parent.deleted_at) {
      return null;
    }
    return tx.vendor_prices.create({
      data: {
        material_vendor_id: req.params.id,
        currency: currency || 'INR',
        unit_price,
        min_order_qty: min_order_qty ?? 1,
        valid_from: new Date(valid_from),
        valid_to: valid_to ? new Date(valid_to) : null,
        source: source || 'QUOTE',
        notes: notes || null,
        created_by: req.user.id,
      },
    });
  });

  if (!price) {
    return res.status(404).json({ success: false, error: 'MPN not found' });
  }
  res.status(201).json({ success: true, data: price });
});
