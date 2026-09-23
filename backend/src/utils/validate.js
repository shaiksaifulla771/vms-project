const { badRequest } = require('./errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v, name, { required = false, max = 500 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw badRequest(`${name} is too long (max ${max})`);
  return s;
}

function uuid(v, name, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  if (!UUID_RE.test(String(v))) throw badRequest(`${name} is not a valid id`);
  return String(v);
}

function num(v, name, { required = false, min, max, gt } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${name} must be a number`);
  if (gt !== undefined && !(n > gt)) throw badRequest(`${name} must be greater than ${gt}`);
  if (min !== undefined && n < min) throw badRequest(`${name} must be at least ${min}`);
  if (max !== undefined && n > max) throw badRequest(`${name} must be at most ${max}`);
  return n;
}

function date(v, name, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  const s = String(v).slice(0, 10);
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw badRequest(`${name} must be a date (YYYY-MM-DD)`);
  return s;
}

function oneOf(v, name, values, { required = false, def } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return def ?? null;
  }
  if (!values.includes(v)) throw badRequest(`${name} must be one of: ${values.join(', ')}`);
  return v;
}

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return v === true || v === 'true' || v === 1 || v === '1';
}

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

module.exports = { str, uuid, num, date, oneOf, bool, round4, UUID_RE };
