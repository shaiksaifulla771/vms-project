const { query } = require('../db/pool');
const { forbidden, AppError } = require('../utils/errors');
const { UUID_RE } = require('../utils/validate');

/**
 * No-login mode. Every request runs as an "acting user" from public.user_profiles:
 *   - the user named in the X-User-Id header (chosen in the UI user switcher), or
 *   - the first admin (fallback).
 * Roles are the existing Supabase roles: admin | editor | viewer.
 */
async function actingUser(req, res, next) {
  try {
    const requested = req.get('x-user-id');
    let user = null;
    if (requested && UUID_RE.test(requested)) {
      const r = await query('select id, full_name, email, role::text as role from public.user_profiles where id = $1', [requested]);
      user = r.rows[0] || null;
    }
    if (!user) {
      const r = await query(`select id, full_name, email, role::text as role from public.user_profiles
                              order by (role::text = 'admin') desc, created_at limit 1`);
      user = r.rows[0] || null;
    }
    if (!user) {
      throw new AppError(500, 'No users found in user_profiles. Create at least one admin user.');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Global/Location/WH selector sent by the UI (headers) or query string. */
function scope(req, res, next) {
  const loc = req.get('x-location-id') || req.query.location_id;
  const wh = req.get('x-warehouse-id') || req.query.warehouse_id;
  req.scope = {
    locationId: loc && UUID_RE.test(loc) ? loc : null,
    warehouseId: wh && UUID_RE.test(wh) ? wh : null,
  };
  next();
}

const canWrite = (user) => user && (user.role === 'admin' || user.role === 'editor');
const isAdmin = (user) => user && user.role === 'admin';

/** Viewers are read-only: block every non-GET request. */
function writeGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!canWrite(req.user)) return next(forbidden('Viewer role is read-only'));
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return next(forbidden('Only Admins can perform this action'));
  next();
}

module.exports = { actingUser, scope, writeGuard, requireAdmin, canWrite, isAdmin };
