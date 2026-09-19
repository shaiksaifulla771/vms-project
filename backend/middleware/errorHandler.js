module.exports = (err, req, res, next) => {
  // Log full stack internally — never send to client
  console.error('[VMS Error]', err.message, '\n', err.stack);

  // Malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      errorType: 'SyntaxError',
      message: 'Malformed JSON payload.',
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map(e => e.message);
    return res.status(400).json({
      success: false,
      errorType: 'ValidationError',
      message: messages.length > 0 ? messages.join('. ') : err.message,
    });
  }

  // Custom validation errors thrown with message prefix
  if (err.message && err.message.startsWith('Validation Failed')) {
    return res.status(400).json({
      success: false,
      errorType: 'ValidationError',
      message: err.message,
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ') || 'field';
    return res.status(409).json({
      success: false,
      errorType: 'DuplicateKeyError',
      message: `A duplicate value already exists for: ${field}.`,
    });
  }

  // CastError (invalid ObjectId etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      errorType: 'InvalidIdError',
      message: `Invalid value for field: ${err.path}.`,
    });
  }

  // MongoDB Connection/Network errors
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    return res.status(503).json({
      success: false,
      errorType: 'DatabaseUnavailableError',
      message: 'Database connection is re-establishing. Please retry in a few seconds.',
    });
  }

  // Postgres/Prisma (Supabase migration): RLS policy rejected the write.
  // This means the route-level requireRole() guard was more permissive
  // than the table's actual RLS policy (they're meant to always agree --
  // see supabaseAuthMiddleware.js) -- worth treating as a bug to fix in
  // the route, not just swallowing as a generic 500. Matched on message
  // rather than a specific Prisma error code since the code Prisma assigns
  // varies by call shape (raw query vs. model method).
  if (err.message && /row-level security policy/i.test(err.message)) {
    return res.status(403).json({
      success: false,
      errorType: 'ForbiddenError',
      message: 'You do not have permission to perform this action.',
    });
  }

  // Prisma unique constraint violation -- Postgres equivalent of Mongo's 11000.
  if (err.code === 'P2002') {
    const fields = (err.meta && err.meta.target) || [];
    return res.status(409).json({
      success: false,
      errorType: 'DuplicateKeyError',
      message: `A duplicate value already exists for: ${Array.isArray(fields) ? fields.join(', ') : fields}.`,
    });
  }

  // Prisma record-not-found (e.g. update/delete targeting a missing row).
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      errorType: 'NotFoundError',
      message: 'The requested record was not found.',
    });
  }

  // Postgres CHECK constraint violation (SQLSTATE 23514) -- surfaces from
  // this schema's extensive use of CHECK constraints for domain validation
  // (quantities, date ranges, percentages, etc.) instead of duplicating
  // that validation in application code.
  if (err.message && /violates check constraint/i.test(err.message)) {
    return res.status(400).json({
      success: false,
      errorType: 'ValidationError',
      message: 'The submitted data violates a database constraint. Please check the values and try again.',
    });
  }

  // Default: 500 internal server error — no stack trace to client
  return res.status(err.status || 500).json({
    success: false,
    errorType: 'InternalServerError',
    message: 'An unexpected error occurred. Please try again or contact support.',
  });
};
