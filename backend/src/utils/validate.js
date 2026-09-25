const { badRequest } = require('./errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Text: objects / arrays are refused (no "[object Object]" lot numbers); NUL characters are refused. */
function str(v, name, { required = false, max = 500 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  if (typeof v === 'object' || typeof v === 'boolean') throw badRequest(`${name} must be text`);
  const s = String(v).trim();
  if (s.includes('\u0000')) throw badRequest(`${name} contains an invalid character`);
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

// Plain decimal numbers only: "12", "-3.5", ".25" - not "0x10", "1e3", true or [5].
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
// Every quantity / price column is numeric(18,4): at most 14 digits before and 4 after the point.
const NUM_LIMIT = 1e12;
const MAX_DP = 4;

function num(v, name, { required = false, min, max, gt, dp = MAX_DP } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  if (typeof v !== 'number' && !(typeof v === 'string' && NUM_RE.test(v.trim()))) throw badRequest(`${name} must be a number`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${name} must be a number`);
  if (gt !== undefined && !(n > gt)) throw badRequest(`${name} must be greater than ${gt}`);
  if (min !== undefined && n < min) throw badRequest(`${name} must be at least ${min}`);
  if (max !== undefined && n > max) throw badRequest(`${name} must be at most ${max}`);
  if (Math.abs(n) >= NUM_LIMIT) throw badRequest(`${name} is too large`);
  if (dp !== null && Math.abs(Math.round(n * 10 ** dp) - n * 10 ** dp) > 1e-6 * Math.max(1, Math.abs(n * 10 ** dp))) {
    throw badRequest(`${name} can have at most ${dp} decimal places`);
  }
  return n;
}

/** A real calendar date YYYY-MM-DD (2026-02-30 is refused), between 1900 and 2100. */
function date(v, name, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  if (typeof v !== 'string') throw badRequest(`${name} must be a date (YYYY-MM-DD)`);
  const s = v.trim();
  // A full timestamp is accepted only when it is a valid one; its date part is used.
  if (s.length > 10 && Number.isNaN(Date.parse(s))) throw badRequest(`${name} must be a date (YYYY-MM-DD)`);
  const d = s.slice(0, 10);
  if (!DATE_RE.test(d)) throw badRequest(`${name} must be a date (YYYY-MM-DD)`);
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) throw badRequest(`${name} is not a real date`);
  if (y < 1900 || y > 2100) throw badRequest(`${name} must be between 1900 and 2100`);
  return d;
}

/** Today in the business time zone (APP_TIMEZONE, default Asia/Kolkata), as YYYY-MM-DD. */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' }).format(new Date());
}

function oneOf(v, name, values, { required = false, def } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${name} is required`);
    return def ?? null;
  }
  if (!values.includes(v)) throw badRequest(`${name} must be one of: ${values.join(', ')}`);
  return v;
}

/** Array of objects: null / non-object items are refused (no crashes on [null]). */
function objList(v, name, { required = false, max = 1000 } = {}) {
  if (v === undefined || v === null) {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  if (!Array.isArray(v)) throw badRequest(`${name} must be a list`);
  if (v.length > max) throw badRequest(`At most ${max} ${name.toLowerCase()} at a time`);
  v.forEach((x, i) => { if (!x || typeof x !== 'object' || Array.isArray(x)) throw badRequest(`${name}: item ${i + 1} is not valid`); });
  return v;
}

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** HSN code: 4, 6 or 8 digits (spaces / dots ignored). Empty -> null. */
const HSN_RE = /^([0-9]{4}|[0-9]{6}|[0-9]{8})$/;
function hsn(v, name = 'HSN code') {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).replace(/[\s.]/g, '');
  if (!HSN_RE.test(s)) {
    const { badRequest } = require('./errors');
    throw badRequest(`${name} must be 4, 6 or 8 digits`);
  }
  return s;
}

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

module.exports = { today, objList, hsn, HSN_RE, str, uuid, num, date, oneOf, bool, round4, UUID_RE };
