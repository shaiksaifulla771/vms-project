// Verifies a Supabase Auth access token, mirroring the JWKS-first /
// legacy-HS256-fallback logic from the reference FastAPI implementation
// (backend/app/core/auth.py in commit a1725a2, kept only as git history —
// see docs/schema.sql's header). Never decode the role out of the token:
// the role is always re-read from public.get_auth_role() inside the
// request's own RLS transaction (see supabaseAuthMiddleware.js), so the API
// layer's role check and Postgres RLS read the exact same source of truth.
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const ASYMMETRIC_ALGORITHMS = ['RS256', 'ES256', 'EdDSA'];

let cachedJwksClient = null;

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL environment variable is not set.');
  }
  return url.replace(/\/$/, '');
}

function getJwksClient() {
  if (!cachedJwksClient) {
    cachedJwksClient = jwksClient({
      jwksUri: `${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return cachedJwksClient;
}

function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

function authError(message, status = 401) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Verifies a Supabase-issued access token and returns its decoded claims.
 * Primary path: Supabase's published JWKS (asymmetric signing keys — the
 * default for new projects). Falls back to a legacy shared-secret HS256
 * path only when JWKS has no matching key for this token's `kid`, never
 * after a genuine signature/claims failure on an asymmetric token.
 */
async function verifySupabaseJwt(token) {
  let decodedHeader;
  try {
    decodedHeader = jwt.decode(token, { complete: true });
  } catch {
    decodedHeader = null;
  }
  if (!decodedHeader || !decodedHeader.header) {
    throw authError('Invalid token format');
  }

  const audience = process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';
  const { kid } = decodedHeader.header;

  let signingKey = null;
  if (kid) {
    try {
      signingKey = await getSigningKey(kid);
    } catch {
      signingKey = null; // no matching JWKS key -- fall through to legacy secret
    }
  }

  if (signingKey) {
    try {
      return jwt.verify(token, signingKey, { algorithms: ASYMMETRIC_ALGORITHMS, audience });
    } catch {
      throw authError('Invalid or expired token');
    }
  }

  const legacySecret = process.env.SUPABASE_JWT_SECRET;
  if (!legacySecret) {
    throw authError('Token could not be verified (no matching JWKS key and no legacy JWT secret configured)');
  }
  try {
    return jwt.verify(token, legacySecret, { algorithms: ['HS256'], audience });
  } catch {
    throw authError('Invalid or expired token');
  }
}

module.exports = { verifySupabaseJwt };
