class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, msg, details);
const notFound = (msg = 'Not found') => new AppError(404, msg);
const forbidden = (msg = 'You do not have permission to perform this action') => new AppError(403, msg);
const conflict = (msg) => new AppError(409, msg);

/** Map PostgreSQL errors to HTTP responses with readable messages. */
function fromPg(err) {
  switch (err.code) {
    case '23505': { // unique_violation
      const m = /Key \((.+?)\)=\((.+?)\)/.exec(err.detail || '');
      return conflict(m ? `Duplicate value for ${m[1]}: ${m[2]}` : 'Duplicate record');
    }
    case '23503': return badRequest('Referenced record does not exist or is still in use');
    case '23514': // check_violation (incl. insufficient stock raised by erp.post_stock)
      return badRequest(err.constraint ? `Invalid value (${err.constraint})` : err.message);
    case '23502': return badRequest(`Missing required field: ${err.column}`);
    case '22P02': return badRequest('Invalid identifier or number format');
    case '22023': return badRequest(err.message);
    case 'P0002': return notFound(err.message);
    case '55000': return conflict(err.message);
    default: return null;
  }
}

module.exports = { AppError, badRequest, notFound, forbidden, conflict, fromPg };
