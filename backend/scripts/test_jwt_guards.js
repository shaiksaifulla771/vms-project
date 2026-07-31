const getJwtSecret = require('../config/jwt');

console.log("=== Testing getJwtSecret Module ===");
console.log(`Current NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`Current JWT_SECRET set: ${Boolean(process.env.JWT_SECRET)}`);

try {
  const secret = getJwtSecret();
  console.log(`SUCCESS: Returned JWT secret (length ${secret.length})`);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
}
