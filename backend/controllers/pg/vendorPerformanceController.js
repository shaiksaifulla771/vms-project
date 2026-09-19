// Postgres/Prisma implementation for public.vendor_performance_ratings,
// following the materialController.js reference pattern. Every query runs
// inside `req.withTransaction(fn)` so RLS enforces itself.
//
// RLS matrix (verified against pg_policies on the live database):
//   SELECT any; INSERT editor-or-admin+own(rated_by = auth.uid(), NOT
//   created_by -- this table uses a different column name); UPDATE none;
//   DELETE none (append-only). No update/delete routes exist for this
//   reason -- there is no RLS policy authorizing them, so building the
//   routes would only ever produce a raw Postgres RLS violation.
const asyncHandler = require('../../middleware/asyncHandler');

exports.getVendorPerformanceRatings = asyncHandler(async (req, res) => {
  const where = req.query.vendorId ? { vendor_id: req.query.vendorId } : undefined;
  const ratings = await req.withTransaction((tx) =>
    tx.vendor_performance_ratings.findMany({
      where,
      orderBy: { created_at: 'desc' },
    }),
  );
  res.status(200).json({ success: true, count: ratings.length, data: ratings });
});

exports.getVendorPerformanceRating = asyncHandler(async (req, res) => {
  const rating = await req.withTransaction((tx) =>
    tx.vendor_performance_ratings.findUnique({ where: { id: req.params.id } }),
  );
  if (!rating) {
    return res.status(404).json({ success: false, error: 'Vendor performance rating not found' });
  }
  res.status(200).json({ success: true, data: rating });
});

exports.createVendorPerformanceRating = asyncHandler(async (req, res) => {
  const { vendor_id, rating, feedback } = req.body;

  if (!vendor_id || rating === undefined || !feedback) {
    return res.status(400).json({ success: false, error: 'vendor_id, rating, and feedback are required' });
  }

  const created = await req.withTransaction((tx) =>
    tx.vendor_performance_ratings.create({
      data: {
        vendor_id,
        rating,
        feedback,
        rated_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: created });
});
