// Supabase Auth + RLS middleware, replacing the Mongo-era dual-engine
// (native JWT + Firebase) authMiddleware.js.
//
// Design note (why per-operation transactions, not one transaction per
// request): the reference FastAPI implementation (backend/app/core/db.py in
// reverted commit a1725a2) held one transaction open for the entire request
// via a dependency-injected session, safe there because a thrown exception
// naturally propagates back through the same await chain that opened the
// transaction. Express doesn't have that guarantee -- a downstream handler
// reports failure via `next(err)`, which Express routes directly to a
// *separate* error-handling middleware elsewhere in the stack, never back
// through this middleware's own call frame. Holding one transaction open
// and trying to detect "did an error happen" from here would mean either
// silently committing failed requests or hand-rolling a fragile signal
// (stashing a reject() on `req` for a global error handler to call, racing
// against `res.on('finish')`). Instead: `protect` does one short
// transaction to resolve the caller's role (fails fast on an unknown
// user), then hands route handlers `req.withTransaction(fn)` -- every
// business operation opens its own transaction, each one re-establishing
// `set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`
// for that operation. This is also just the normal way to use Prisma
// transactions: a handler that needs several writes to be atomic passes a
// callback that makes several `tx.*` calls; one that needs a single read
// or write passes a callback that makes one.
const { verifySupabaseJwt } = require('../config/supabaseAuth');
const { getPrismaClient } = require('../config/prismaClient');

const LOCK_TIMEOUT_MS = parseInt(process.env.DB_LOCK_TIMEOUT_MS || '5000', 10);
const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10);

const ROLE_RANK = { viewer: 0, editor: 1, admin: 2 };

function authError(message, status = 401) {
  return Object.assign(new Error(message), { status });
}

/**
 * Runs `fn(tx)` inside one Postgres transaction opened as the `authenticated`
 * role with `claimsJson` set as `request.jwt.claims`, so `auth.uid()` and
 * `public.get_auth_role()` resolve correctly for every RLS policy `fn`
 * triggers. Commits on success, rolls back if `fn` throws -- standard
 * Prisma `$transaction` semantics, nothing bespoke.
 */
async function runInRlsTransaction(prisma, claimsJson, fn) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`;
      await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
      return fn(tx);
    },
    { maxWait: 5000, timeout: STATEMENT_TIMEOUT_MS + 5000 },
  );
}

exports.protect = async function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
  }

  const token = header.slice(7);
  if (!token || token.split('.').length !== 3) {
    return res.status(401).json({ success: false, error: 'Invalid token format' });
  }

  let claims;
  try {
    claims = await verifySupabaseJwt(token);
  } catch (err) {
    return res.status(err.status || 401).json({ success: false, error: err.message || 'Authentication failed' });
  }

  if (!claims.sub) {
    return res.status(401).json({ success: false, error: 'Token missing subject' });
  }

  let prisma;
  try {
    prisma = await getPrismaClient();
  } catch {
    return res.status(500).json({ success: false, error: 'Database unavailable' });
  }

  const claimsJson = JSON.stringify(claims);

  let role;
  try {
    role = await runInRlsTransaction(prisma, claimsJson, async (tx) => {
      const rows = await tx.$queryRaw`SELECT public.get_auth_role() AS role`;
      return rows && rows[0] ? rows[0].role : null;
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Authentication check failed' });
  }

  if (!role) {
    return res.status(403).json({ success: false, error: 'No user_profiles row for this account' });
  }

  req.user = { id: claims.sub, email: claims.email || null, role };
  req.withTransaction = (fn) => runInRlsTransaction(prisma, claimsJson, fn);

  next();
};

exports.requireRole = function requireRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const have = ROLE_RANK[req.user.role];
    const need = ROLE_RANK[minimumRole];
    if (have === undefined || need === undefined || have < need) {
      return res.status(403).json({ success: false, error: `Requires '${minimumRole}' role or higher` });
    }
    return next();
  };
};

exports.requireViewer = exports.requireRole('viewer');
exports.requireEditor = exports.requireRole('editor');
exports.requireAdmin = exports.requireRole('admin');
