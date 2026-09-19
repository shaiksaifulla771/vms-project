// Postgres/Prisma implementation for public.vendor_contracts, following the
// materialController.js reference pattern. Every query runs inside
// `req.withTransaction(fn)` so RLS enforces itself; route guards must match
// the RLS matrix exactly.
//
// RLS matrix (verified against pg_policies on the live database):
//   SELECT any; INSERT editor-or-admin+own(created_by); UPDATE editor-or-admin;
//   DELETE admin
//
// vendor_contracts has no deleted_at/deleted_by columns in prisma/schema.prisma,
// so unlike materials/vendors/vendor_masters this is a hard delete (matches
// what the admin-gated DELETE RLS policy allows).
const asyncHandler = require('../../middleware/asyncHandler');

exports.getVendorContracts = asyncHandler(async (req, res) => {
  const contracts = await req.withTransaction((tx) =>
    tx.vendor_contracts.findMany({ orderBy: { start_date: 'desc' } }),
  );
  res.status(200).json({ success: true, count: contracts.length, data: contracts });
});

exports.getVendorContract = asyncHandler(async (req, res) => {
  const contract = await req.withTransaction((tx) => tx.vendor_contracts.findUnique({ where: { id: req.params.id } }));
  if (!contract) {
    return res.status(404).json({ success: false, error: 'Vendor contract not found' });
  }
  res.status(200).json({ success: true, data: contract });
});

exports.createVendorContract = asyncHandler(async (req, res) => {
  const { vendor_id, title, start_date, end_date, status, value, document_url } = req.body;

  if (!vendor_id || !title || !start_date || !end_date || value === undefined) {
    return res
      .status(400)
      .json({ success: false, error: 'vendor_id, title, start_date, end_date, and value are required' });
  }

  const contract = await req.withTransaction((tx) =>
    tx.vendor_contracts.create({
      data: {
        vendor_id,
        title,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        status: status || 'PENDING',
        value,
        document_url: document_url || '',
        created_by: req.user.id,
      },
    }),
  );
  res.status(201).json({ success: true, data: contract });
});

exports.updateVendorContract = asyncHandler(async (req, res) => {
  const { vendor_id, title, start_date, end_date, status, value, document_url } = req.body;

  const contract = await req.withTransaction(async (tx) => {
    const existing = await tx.vendor_contracts.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return null;
    }
    return tx.vendor_contracts.update({
      where: { id: req.params.id },
      data: {
        ...(vendor_id !== undefined && { vendor_id }),
        ...(title !== undefined && { title }),
        ...(start_date !== undefined && { start_date: new Date(start_date) }),
        ...(end_date !== undefined && { end_date: new Date(end_date) }),
        ...(status !== undefined && { status }),
        ...(value !== undefined && { value }),
        ...(document_url !== undefined && { document_url }),
        updated_by: req.user.id,
        updated_at: new Date(),
      },
    });
  });

  if (!contract) {
    return res.status(404).json({ success: false, error: 'Vendor contract not found' });
  }
  res.status(200).json({ success: true, data: contract });
});

// Hard delete -- public.vendor_contracts has no deleted_at/deleted_by
// columns, and the DELETE RLS policy is admin-only with no soft-delete
// convention for this table (see prisma/schema.prisma).
exports.deleteVendorContract = asyncHandler(async (req, res) => {
  const contract = await req.withTransaction(async (tx) => {
    const existing = await tx.vendor_contracts.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return null;
    }
    return tx.vendor_contracts.delete({ where: { id: req.params.id } });
  });

  if (!contract) {
    return res.status(404).json({ success: false, error: 'Vendor contract not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
