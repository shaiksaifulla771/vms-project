const logger = require('../utils/logger');

const queryPerformanceLogger = (req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const timeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    // Log slow queries/requests taking >200ms
    if (parseFloat(timeMs) > 200) {
      logger.warn(req, `[SLOW QUERY] ${req.method} ${req.originalUrl} completed in ${timeMs}ms with status ${res.statusCode}`, {
        method: req.method,
        url: req.originalUrl,
        durationMs: parseFloat(timeMs),
        statusCode: res.statusCode,
        query: req.query
      });
    }
  });

  next();
};

module.exports = queryPerformanceLogger;
