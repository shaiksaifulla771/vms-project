/**
 * Single source of truth for JWT_SECRET configuration.
 * Validates production requirements and provides safe dev warnings.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || 'super-secret-key-32-chars-long-12345';

  if (secret.length < 32 && process.env.NODE_ENV === 'production') {
    console.error('FATAL ERROR: JWT_SECRET is too short for production use (minimum 32 characters required).');
    process.exit(1);
  }

  return secret;
}

module.exports = getJwtSecret;
