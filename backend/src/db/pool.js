const { Pool, types } = require('pg');

// NUMERIC -> JS number (quantities fit comfortably in double precision)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// DATE -> 'YYYY-MM-DD' string (avoid timezone shifts)
types.setTypeParser(1082, (v) => v);

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. See backend/.env.example');
    }
    const useSsl = process.env.DATABASE_SSL === 'true' || /supabase\.(co|com)/.test(connectionString);
    pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
      // pg's default is to wait forever for a connection; fail with an error instead of hanging the request.
      connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECT_TIMEOUT_MS || '10000', 10),
      // Keeps idle sockets to the Supabase pooler from being silently dropped by the network.
      keepAlive: true,
    });
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Run fn(client) inside BEGIN/COMMIT. Any throw rolls everything back,
 * so multi-step inventory operations are all-or-nothing.
 */
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, withTransaction, close };
