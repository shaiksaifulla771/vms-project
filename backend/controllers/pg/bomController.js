// Postgres/Prisma implementation for the BOM (Bill of Materials) domain,
// following the pattern proven out in materialController.js. Every query
// runs inside `req.withTransaction(fn)` -- opened per-call by
// supabaseAuthMiddleware.protect, running as the `authenticated` role with
// this caller's JWT claims set, so RLS on `public.boms` / `public.bom_items`
// is enforced by Postgres itself, not just by the `requireAdmin` gate on the
// route. Both tables are 100% admin-gated for every write (no editor tier
// for BOM), so the two checks read the same source of truth and cannot
// disagree.
const asyncHandler = require('../../middleware/asyncHandler');

exports.getBoms = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const { product_id } = req.query;

  const where = {
    ...(includeDeleted ? {} : { deleted_at: null }),
    ...(product_id && { product_id }),
  };

  const boms = await req.withTransaction((tx) =>
    tx.boms.findMany({
      where,
      orderBy: [{ product_id: 'asc' }, { version: 'desc' }],
    }),
  );
  res.status(200).json({ success: true, count: boms.length, data: boms });
});

exports.getBom = asyncHandler(async (req, res) => {
  const bom = await req.withTransaction((tx) =>
    tx.boms.findUnique({
      where: { id: req.params.id },
      include: { bom_items: true },
    }),
  );
  if (!bom) {
    return res.status(404).json({ success: false, error: 'BOM not found' });
  }
  res.status(200).json({ success: true, data: bom });
});

// Creating a new active version for a product is handled thoughtfully by
// the DB, not here: `uq_boms_one_active_per_product` (a partial unique
// index on product_id where is_active = true) rejects a second active BOM
// for the same product, surfaced as a clean 409 by errorHandler.js's P2002
// mapping. Keep this controller simple and trust the constraint rather than
// pre-empting it with a duplicate-check query.
exports.createBom = asyncHandler(async (req, res) => {
  const { product_id, version, is_active } = req.body;

  if (!product_id) {
    return res.status(400).json({ success: false, error: 'product_id is required' });
  }

  const bom = await req.withTransaction((tx) =>
    tx.boms.create({
      data: {
        product_id,
        version: version ?? 1,
        is_active: is_active ?? true,
        created_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: bom });
});

exports.updateBom = asyncHandler(async (req, res) => {
  const { version, is_active } = req.body;

  const bom = await req.withTransaction(async (tx) => {
    const existing = await tx.boms.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.boms.update({
      where: { id: req.params.id },
      data: {
        ...(version !== undefined && { version }),
        ...(is_active !== undefined && { is_active }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!bom) {
    return res.status(404).json({ success: false, error: 'BOM not found' });
  }
  res.status(200).json({ success: true, data: bom });
});

// Soft-delete only, mirrors materialController.js's deleteMaterial.
exports.deleteBom = asyncHandler(async (req, res) => {
  const bom = await req.withTransaction(async (tx) => {
    const existing = await tx.boms.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.boms.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), deleted_by: req.user.id },
    });
  });

  if (!bom) {
    return res.status(404).json({ success: false, error: 'BOM not found' });
  }
  res.status(200).json({ success: true, data: {} });
});

// -- bom_items: child CRUD scoped under /api/pg/boms/:bomId/items --

exports.getBomItems = asyncHandler(async (req, res) => {
  const bom = await req.withTransaction((tx) => tx.boms.findUnique({ where: { id: req.params.bomId } }));
  if (!bom) {
    return res.status(404).json({ success: false, error: 'BOM not found' });
  }

  const items = await req.withTransaction((tx) =>
    tx.bom_items.findMany({
      where: { bom_id: req.params.bomId },
      orderBy: { created_at: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: items.length, data: items });
});

exports.addBomItem = asyncHandler(async (req, res) => {
  const { material_id, formula_percentage, standard_qty, uom } = req.body;

  if (!material_id || formula_percentage === undefined || standard_qty === undefined) {
    return res.status(400).json({ success: false, error: 'material_id, formula_percentage, and standard_qty are required' });
  }

  const item = await req.withTransaction(async (tx) => {
    const bom = await tx.boms.findUnique({ where: { id: req.params.bomId } });
    if (!bom || bom.deleted_at) {
      return null;
    }
    return tx.bom_items.create({
      data: {
        bom_id: req.params.bomId,
        material_id,
        formula_percentage,
        standard_qty,
        uom: uom || 'kg',
      },
    });
  });

  if (!item) {
    return res.status(404).json({ success: false, error: 'BOM not found' });
  }
  res.status(201).json({ success: true, data: item });
});

exports.updateBomItem = asyncHandler(async (req, res) => {
  const { material_id, formula_percentage, standard_qty, uom } = req.body;

  const item = await req.withTransaction(async (tx) => {
    const existing = await tx.bom_items.findUnique({ where: { id: req.params.itemId } });
    if (!existing || existing.bom_id !== req.params.bomId) {
      return null;
    }
    return tx.bom_items.update({
      where: { id: req.params.itemId },
      data: {
        ...(material_id !== undefined && { material_id }),
        ...(formula_percentage !== undefined && { formula_percentage }),
        ...(standard_qty !== undefined && { standard_qty }),
        ...(uom !== undefined && { uom }),
      },
    });
  });

  if (!item) {
    return res.status(404).json({ success: false, error: 'BOM item not found' });
  }
  res.status(200).json({ success: true, data: item });
});

exports.deleteBomItem = asyncHandler(async (req, res) => {
  const item = await req.withTransaction(async (tx) => {
    const existing = await tx.bom_items.findUnique({ where: { id: req.params.itemId } });
    if (!existing || existing.bom_id !== req.params.bomId) {
      return null;
    }
    return tx.bom_items.delete({ where: { id: req.params.itemId } });
  });

  if (!item) {
    return res.status(404).json({ success: false, error: 'BOM item not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
