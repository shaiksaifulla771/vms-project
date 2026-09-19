// Postgres/Prisma rewrite for Warehouses, following the same pattern as
// controllers/pg/materialController.js. Every query runs inside
// `req.withTransaction(fn)` -- opened per-call by
// supabaseAuthMiddleware.protect, running as the `authenticated` role with
// this caller's JWT claims set, so RLS on `public.warehouses` is enforced by
// Postgres itself, not just by the `requireAdmin` gate on the route.
//
// Note: `public.locations` has an AFTER INSERT trigger that auto-creates one
// default warehouse per new location (see controllers/pg/locationController.js).
// createWarehouse here is for adding *additional*, non-default warehouses to
// an already-existing location -- it never runs for the trigger's own insert.
const asyncHandler = require('../../middleware/asyncHandler');

exports.getWarehouses = asyncHandler(async (req, res) => {
  const { location_id } = req.query;
  const warehouses = await req.withTransaction((tx) =>
    tx.warehouses.findMany({
      where: location_id ? { location_id } : undefined,
      orderBy: { code: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: warehouses.length, data: warehouses });
});

exports.getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await req.withTransaction((tx) => tx.warehouses.findUnique({ where: { id: req.params.id } }));
  if (!warehouse) {
    return res.status(404).json({ success: false, error: 'Warehouse not found' });
  }
  res.status(200).json({ success: true, data: warehouse });
});

exports.createWarehouse = asyncHandler(async (req, res) => {
  const { location_id, name, code, is_default } = req.body;

  if (!location_id || !name || !code) {
    return res.status(400).json({ success: false, error: 'location_id, name, and code are required' });
  }

  const warehouse = await req.withTransaction(async (tx) => {
    if (is_default) {
      await tx.warehouses.updateMany({
        where: { location_id, is_default: true },
        data: { is_default: false, updated_by: req.user.id, updated_at: new Date() },
      });
    }
    return tx.warehouses.create({
      data: {
        location_id,
        name,
        code,
        is_default: is_default ?? false,
        created_by: req.user.id,
      },
    });
  });

  res.status(201).json({ success: true, data: warehouse });
});

exports.updateWarehouse = asyncHandler(async (req, res) => {
  const { name, code, is_default } = req.body;

  const warehouse = await req.withTransaction(async (tx) => {
    const existing = await tx.warehouses.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return null;
    }

    // Application-layer enforcement of "only one default warehouse per
    // location" -- the DB's unique index is on (location_id, code), not on
    // is_default, so nothing at the DB level stops multiple defaults.
    if (is_default === true && !existing.is_default) {
      await tx.warehouses.updateMany({
        where: { location_id: existing.location_id, is_default: true },
        data: { is_default: false, updated_by: req.user.id, updated_at: new Date() },
      });
    }

    return tx.warehouses.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(is_default !== undefined && { is_default }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!warehouse) {
    return res.status(404).json({ success: false, error: 'Warehouse not found' });
  }
  res.status(200).json({ success: true, data: warehouse });
});

// Hard delete -- public.warehouses has no deleted_at/deleted_by columns
// (see prisma/schema.prisma). Deleting a warehouse with dependent rows
// (inventory_lots, batch_records, etc.) will fail on the FK constraint;
// that failure surfaces through the standard error handler.
//
// "1 location -> at least 1 default warehouse" is only enforced at the DB
// level at location-creation time (internal.trg_auto_create_default_warehouse,
// see locationController.js) -- there is no DB trigger blocking deletion of
// that default warehouse afterward (confirmed: `pg_trigger` on
// public.warehouses returns no rows). Since the handwritten spec calls this
// out as a standing invariant ("1 Location -> 1 WH minimum, Default"), not
// just a creation-time rule, it's enforced here: deleting a warehouse whose
// is_default is true is blocked with a 409, forcing an explicit
// updateWarehouse({is_default:true}) on another warehouse for that location
// first (which itself clears the old default, see updateWarehouse above).
exports.deleteWarehouse = asyncHandler(async (req, res) => {
  const result = await req.withTransaction(async (tx) => {
    const existing = await tx.warehouses.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return { status: 404, error: 'Warehouse not found' };
    }
    if (existing.is_default) {
      return {
        status: 409,
        error: 'Cannot delete the default warehouse for a location. Set another warehouse as default first.',
      };
    }
    await tx.warehouses.delete({ where: { id: req.params.id } });
    return { status: 200 };
  });

  if (result.status !== 200) {
    return res.status(result.status).json({ success: false, error: result.error });
  }
  res.status(200).json({ success: true, data: {} });
});
