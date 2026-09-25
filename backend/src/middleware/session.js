const { query } = require('../db/pool');
const { forbidden, AppError } = require('../utils/errors');
const { UUID_RE } = require('../utils/validate');

/**
 * No-login mode. Every request runs as an "acting user" from public.user_profiles, named in the
 * X-User-Id header (chosen in the UI user switcher).
 *
 * Only GET /api/session may fall back to a default user (the first admin), so the UI can start and
 * learn who to act as. Every other request needs a valid, known X-User-Id: a missing, malformed or
 * unknown id is refused (401) instead of silently running as an admin. Because the header is custom,
 * a browser on another site cannot send it without a CORS preflight, which closes cross-site POSTs.
 */
const USER_SQL = 'select id, full_name, email, role::text as role from public.user_profiles';

async function actingUser(req, res, next) {
  try {
    const requested = req.get('x-user-id');
    const isSessionBootstrap = req.method === 'GET' && (req.path === '/session' || req.path === '/session/');
    let user = null;
    if (requested && UUID_RE.test(requested)) {
      user = (await query(`${USER_SQL} where id = $1`, [requested])).rows[0] || null;
    }
    if (!user && isSessionBootstrap) {
      user = (await query(`${USER_SQL} order by (role::text = 'admin') desc, created_at limit 1`)).rows[0] || null;
      if (!user) throw new AppError(500, 'No users found in user_profiles. Create at least one admin user.');
    }
    if (!user) {
      throw new AppError(401, requested
        ? 'Unknown user. Reload the page and choose a user in the top bar.'
        : 'No user selected (X-User-Id header missing). Reload the page and choose a user in the top bar.');
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
  // Read-only calculations sent as POST (nothing is saved) are open to viewers too.
  if (req.method === 'POST' && req.path === '/plans/simulate') return next();
  if (!canWrite(req.user)) return next(forbidden('Viewer role is read-only'));
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return next(forbidden('Only Admins can perform this action'));
  next();
}

module.exports = { actingUser, scope, writeGuard, requireAdmin, canWrite, isAdmin };
