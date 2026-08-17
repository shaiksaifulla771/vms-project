/**
 * Single source of truth for JWT_SECRET configuration.
 * SECURITY: Never falls back to a hardcoded value — crashes on missing secret.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const msg = 'FATAL ERROR: JWT_SECRET environment variable is not set. Server startup aborted.';
    console.error(msg);
    process.exit(1);
  }

  if (secret.length < 32) {
    const msg = `FATAL ERROR: JWT_SECRET is too short (${secret.length} chars). Minimum 32 characters required for cryptographic security.`;
    console.error(msg);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('[JWT] WARNING: Weak JWT_SECRET detected in development. Generate a strong secret before deploying to production.');
    }
  }

  return secret;
}

module.exports = getJwtSecret;
