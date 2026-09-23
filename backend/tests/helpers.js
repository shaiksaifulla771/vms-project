const request = require('supertest');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/erp_test';

const { getPool, withTransaction, close } = require('../src/db/pool');
const { migrate } = require('../db/migrate');
const { seedDemo } = require('../db/seed');
const { createApp } = require('../src/app');

async function resetDb() {
  const pool = getPool();
  await pool.query('drop schema if exists public cascade; drop schema if exists erp cascade; create schema public;');
  await migrate({ silent: true });
  await withTransaction(seedDemo);
}

async function ctx() {
  const pool = getPool();
  const one = async (sql, p) => (await pool.query(sql, p)).rows[0];
  return {
    admin: await one(`select id from public.user_profiles where role = 'admin'`),
    editor: await one(`select id from public.user_profiles where role = 'editor'`),
    viewer: await one(`select id from public.user_profiles where role = 'viewer'`),
    mum: await one(`select id from public.locations where code = 'MUM'`),
    pun: await one(`select id from public.locations where code = 'PUN'`),
    wh1: await one(`select w.id from public.warehouses w join public.locations l on l.id = w.location_id where l.code='MUM' and w.code='WH-01'`),
    wh2: await one(`select w.id from public.warehouses w join public.locations l on l.id = w.location_id where l.code='MUM' and w.code='WH-02'`),
    punWh: await one(`select w.id from public.warehouses w join public.locations l on l.id = w.location_id where l.code='PUN'`),
    fg: await one(`select id from public.materials where code = 'FG-RL1'`),
    rice: await one(`select id from public.materials where code = 'RM-RICE'`),
    lentil: await one(`select id from public.materials where code = 'RM-LENTIL'`),
    pouch: await one(`select id from public.materials where code = 'PK-POUCH'`),
    riceMpn: await one(`select id from public.mpns where mpn_code = 'MPN-RICE-AG'`),
    fgMpn: await one(`select id from public.mpns where mpn_code = 'FG-RL1'`),
    lot: async (code) => one(`select * from public.inventory where lot_no = $1`, [code]),
  };
}

function api(userId) {
  const app = createApp();
  const wrap = (method) => (url, body) => {
    let r = request(app)[method](`/api${url}`);
    if (userId) r = r.set('X-User-Id', userId);
    return body !== undefined ? r.send(body) : r;
  };
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch') };
}

module.exports = { resetDb, ctx, api, getPool, close };
