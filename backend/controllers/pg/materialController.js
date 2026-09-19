// Reference implementation for the Postgres/Prisma rewrite (step 6 of the
// migration plan). Every query runs inside `req.withTransaction(fn)` --
// opened per-call by supabaseAuthMiddleware.protect, running as the
// `authenticated` role with this caller's JWT claims set, so RLS on
// `public.materials` is enforced by Postgres itself, not just by the
// `requireEditor`/`requireAdmin` gate on the route. The two checks read the
// same source of truth (`public.get_auth_role()`) and cannot disagree.
const asyncHandler = require('../../middleware/asyncHandler');

exports.getMaterials = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const materials = await req.withTransaction((tx) =>
    tx.materials.findMany({
      where: includeDeleted ? undefined : { deleted_at: null },
      orderBy: { code: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: materials.length, data: materials });
});

exports.getMaterial = asyncHandler(async (req, res) => {
  const material = await req.withTransaction((tx) => tx.materials.findUnique({ where: { id: req.params.id } }));
  if (!material) {
    return res.status(404).json({ success: false, error: 'Material not found' });
  }
  res.status(200).json({ success: true, data: material });
});

exports.createMaterial = asyncHandler(async (req, res) => {
  const { code, name, classification, uom, hsn_code, safety_stock, reorder_point, moq, lead_time_days, is_hazardous } = req.body;

  if (!code || !name || !classification) {
    return res.status(400).json({ success: false, error: 'code, name, and classification are required' });
  }

  const material = await req.withTransaction((tx) =>
    tx.materials.create({
      data: {
        code,
        name,
        classification,
        uom: uom || 'kg',
        hsn_code: hsn_code || null,
        safety_stock: safety_stock ?? 0,
        reorder_point: reorder_point ?? 0,
        moq: moq ?? 1,
        lead_time_days: lead_time_days ?? 7,
        is_hazardous: is_hazardous ?? false,
        created_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: material });
});

exports.updateMaterial = asyncHandler(async (req, res) => {
  const { code, name, classification, uom, hsn_code, safety_stock, reorder_point, moq, lead_time_days, is_hazardous, status } = req.body;

  const material = await req.withTransaction(async (tx) => {
    const existing = await tx.materials.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.materials.update({
      where: { id: req.params.id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(classification !== undefined && { classification }),
        ...(uom !== undefined && { uom }),
        ...(hsn_code !== undefined && { hsn_code }),
        ...(safety_stock !== undefined && { safety_stock }),
        ...(reorder_point !== undefined && { reorder_point }),
        ...(moq !== undefined && { moq }),
        ...(lead_time_days !== undefined && { lead_time_days }),
        ...(is_hazardous !== undefined && { is_hazardous }),
        ...(status !== undefined && { status }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!material) {
    return res.status(404).json({ success: false, error: 'Material not found' });
  }
  res.status(200).json({ success: true, data: material });
});

// Soft-delete only -- this schema's materials table has no hard-delete
// path (mirrors the Mongoose model's deactivation pattern and the
// schema's own deleted_at/deleted_by convention, see docs/schema.sql).
exports.deleteMaterial = asyncHandler(async (req, res) => {
  const material = await req.withTransaction(async (tx) => {
    const existing = await tx.materials.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return null;
    }
    return tx.materials.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), deleted_by: req.user.id },
    });
  });

  if (!material) {
    return res.status(404).json({ success: false, error: 'Material not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
