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

  // Default: 500 internal server error — no stack trace to client
  return res.status(err.status || 500).json({
    success: false,
    errorType: 'InternalServerError',
    message: 'An unexpected error occurred. Please try again or contact support.',
  });
};
