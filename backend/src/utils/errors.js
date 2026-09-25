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

const CHECK_MESSAGES = {
  vendor_bank_accounts_ifsc_check: 'IFSC must look like HDFC0001234',
  vendor_bank_accounts_account_number_check: 'Account number must be 6-20 digits',
  mpn_vendors_moq_check: 'MOQ must be greater than 0',
  mpn_vendors_price_check: 'Price cannot be negative',
  boms_packing_cost_check: 'Packing cost cannot be negative',
  boms_processing_cost_check: 'Processing cost cannot be negative',
  boms_overhead_cost_check: 'Overhead cost cannot be negative',
  boms_freight_cost_check: 'Freight cost cannot be negative',
};

const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_MESSAGES = {
  batch_inputs_batch_id_mpn_id_lot_no_key: 'The same lot is listed twice in this batch: merge the two rows',
  batches_client_request_uq: 'This batch was already submitted (double click). Open Batches to see it.',
};

const DB_UNREACHABLE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE',
  '57P01', '57P03', '53300', // admin shutdown, cannot connect now, too many connections
]);
const DB_UNREACHABLE_MESSAGE = /timeout exceeded when trying to connect|Connection terminated|max clients reached/i;

/** True when the database itself could not be reached (network, pooler limits), not a bad request. */
function isDbUnreachable(err) {
  return DB_UNREACHABLE_CODES.has(err.code)
    || (typeof err.code === 'string' && err.code.startsWith('08')) // connection_exception class
    || DB_UNREACHABLE_MESSAGE.test(err.message || '');
}

/** Map PostgreSQL errors to HTTP responses with readable messages. */
function fromPg(err) {
  if (isDbUnreachable(err)) {
    return new AppError(503, 'The database is not reachable right now. Please try again in a few seconds.');
  }
  switch (err.code) {
    case '23505': { // unique_violation: name the fields and the readable values (never internal ids)
      if (err.constraint && UNIQUE_MESSAGES[err.constraint]) return conflict(UNIQUE_MESSAGES[err.constraint]);
      const m = /Key \((.+?)\)=\((.+?)\)/.exec(err.detail || '');
      if (!m) return conflict('This record already exists');
      const fields = m[1].split(',').map((f) => f.trim().replace(/_id$/, '').replace(/_/g, ' '));
      const values = m[2].split(',').map((x) => x.trim()).filter((x) => !UUID_ANY.test(x));
      return conflict(`Already exists: ${fields.join(', ')}${values.length ? ` (${values.join(', ')})` : ''}`);
    }
    case '23503': return badRequest('Referenced record does not exist or is still in use');
    case '23514': // check_violation (incl. insufficient stock raised by erp.post_stock)
      if (err.constraint && CHECK_MESSAGES[err.constraint]) return badRequest(CHECK_MESSAGES[err.constraint]);
      if (err.constraint && /qty|quantity|balance/.test(err.constraint)) return badRequest('Quantity is invalid: it must be a positive amount with at most 4 decimal places');
      return badRequest(err.constraint ? `Invalid value: ${err.constraint.replace(/_check$/, '').replace(/_/g, ' ')}` : err.message);
    case 'P0001': return badRequest(err.message); // raised by our own triggers
    case '23502': return badRequest(`Missing required field: ${err.column}`);
    case '22P02': return badRequest('Invalid identifier or number format');
    case '22003': return badRequest('A number is too large');
    case '22008': case '22007': return badRequest('Invalid date');
    case '22021': return badRequest('Text contains an invalid character');
    case '22001': return badRequest('A text value is too long');
    case '22023': return badRequest(err.message);
    case 'P0002': return notFound(err.message);
    case '55000': return conflict(err.message);
    default: return null;
  }
}

module.exports = { AppError, badRequest, notFound, forbidden, conflict, fromPg };
