/**
 * Single source of truth for JWT_SECRET configuration.
 * Validates production requirements and provides safe dev warnings.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      console.error('FATAL ERROR: JWT_SECRET environment variable is required when NODE_ENV=production.');
      process.exit(1);
    }
    console.warn('WARNING: JWT_SECRET not set — using an insecure development-only fallback. Do NOT deploy this to production.');
    return 'dev-only-insecure-fallback-do-not-use-in-production';
  }

  if (secret.length < 32 && isProd) {
    console.error('FATAL ERROR: JWT_SECRET is too short for production use (minimum 32 characters recommended).');
    process.exit(1);
  }

  return secret;
}

module.exports = getJwtSecret;
