/* Applies db/migrations/*.sql in order, once each (tracked in erp.schema_migrations). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getPool, close } = require('../src/db/pool');

async function migrate({ silent = false } = {}) {
  const pool = getPool();
  await pool.query('create schema if not exists erp');
  await pool.query(`create table if not exists erp.schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('select name from erp.schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('insert into erp.schema_migrations(name) values ($1)', [file]);
      await client.query('COMMIT');
      if (!silent) console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${err.message}`, { cause: err });
    } finally {
      client.release();
    }
  }
  if (!silent) console.log('[migrate] up to date');
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .then(() => close())
    .catch(async (err) => {
      console.error('[migrate] failed:', err.message);
      await close();
      process.exit(1);
    });
}
