module.exports = (err, req, res, next) => {
  console.error('System Architectural Error Catch:', err.stack);

  if (err.name === 'ValidationError' || err.message.startsWith('Validation Failed')) {
    return res.status(400).json({
      success: false,
      errorType: 'ValidationError',
      message: err.stack
    });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      errorType: 'DuplicateKeyError',
      message: 'A structured asset rule violation occurred: This active version BOM document already exists.'
    });
  }

  return res.status(500).json({
    success: false,
    errorType: 'InternalServerError',
    message: 'An internal platform runtime anomaly has halted execution.'
  });
};
