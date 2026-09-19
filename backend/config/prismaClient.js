// Prisma 7's "prisma-client" generator requires a driver adapter — there is
// no `url`/`directUrl` in schema.prisma to read at runtime (Prisma 7 moved
// that to prisma.config.ts, used only by the CLI). The generated client is
// also ESM-syntax TypeScript (see generated/prisma/package.json, restored by
// `npm run prisma:generate`), so it's loaded here via dynamic import() from
// this CommonJS module rather than require().
let clientPromise = null;

async function initPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  const { PrismaClient } = await import('../generated/prisma/client.ts');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * Returns a promise for the shared PrismaClient singleton. The connecting
 * role is `postgres` (DATABASE_URL's own credentials) — RLS enforcement
 * comes from each request's transaction running `SET LOCAL ROLE
 * authenticated`, not from a separate low-privilege connection string. See
 * backend/middleware/supabaseAuthMiddleware.js.
 */
function getPrismaClient() {
  if (!clientPromise) {
    clientPromise = initPrismaClient();
  }
  return clientPromise;
}

module.exports = { getPrismaClient };
