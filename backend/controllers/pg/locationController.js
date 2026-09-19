// Postgres/Prisma rewrite for Sites/Locations, following the same pattern as
// controllers/pg/materialController.js. Every query runs inside
// `req.withTransaction(fn)` -- opened per-call by
// supabaseAuthMiddleware.protect, running as the `authenticated` role with
// this caller's JWT claims set, so RLS on `public.locations` is enforced by
// Postgres itself, not just by the `requireAdmin` gate on the route.
//
// Important: `public.locations` has an AFTER INSERT trigger
// (trg_locations_after_insert -> internal.trg_auto_create_default_warehouse)
// that automatically creates one default warehouse for every new location.
// createLocation below must NOT create a warehouse itself -- it only
// inserts the location row and (optionally) re-reads the warehouse the
// trigger already created so the response can include it.
const asyncHandler = require('../../middleware/asyncHandler');

exports.getLocations = asyncHandler(async (req, res) => {
  const locations = await req.withTransaction((tx) =>
    tx.locations.findMany({
      orderBy: { code: 'asc' },
    }),
  );
  res.status(200).json({ success: true, count: locations.length, data: locations });
});

exports.getLocation = asyncHandler(async (req, res) => {
  const location = await req.withTransaction((tx) =>
    tx.locations.findUnique({
      where: { id: req.params.id },
      include: { warehouses: true },
    }),
  );
  if (!location) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }
  res.status(200).json({ success: true, data: location });
});

exports.createLocation = asyncHandler(async (req, res) => {
  const { name, code, address } = req.body;

  if (!name || !code) {
    return res.status(400).json({ success: false, error: 'name and code are required' });
  }

  // Insert only -- trg_locations_after_insert auto-creates the default
  // warehouse for this location; do not create one here.
  const result = await req.withTransaction(async (tx) => {
    const location = await tx.locations.create({
      data: {
        name,
        code,
        address: address || null,
        created_by: req.user.id,
      },
    });
    const warehouses = await tx.warehouses.findMany({ where: { location_id: location.id } });
    return { location, warehouses };
  });

  res.status(201).json({ success: true, data: { ...result.location, warehouses: result.warehouses } });
});

exports.updateLocation = asyncHandler(async (req, res) => {
  const { name, code, address } = req.body;

  const location = await req.withTransaction(async (tx) => {
    const existing = await tx.locations.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return null;
    }
    return tx.locations.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(address !== undefined && { address }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!location) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }
  res.status(200).json({ success: true, data: location });
});

// Hard delete -- public.locations has no deleted_at/deleted_by columns
// (see prisma/schema.prisma), unlike materials' soft-delete convention.
// A location with dependent warehouses/inventory will fail on the FK
// constraint; that failure surfaces through the standard error handler.
exports.deleteLocation = asyncHandler(async (req, res) => {
  const location = await req.withTransaction(async (tx) => {
    const existing = await tx.locations.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return null;
    }
    await tx.locations.delete({ where: { id: req.params.id } });
    return existing;
  });

  if (!location) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
