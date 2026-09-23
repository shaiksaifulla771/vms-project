/*
 * Demo data for a fresh local database (NOT needed on Supabase - real data was migrated there).
 * Usage: npm run seed:demo      (refuses to run if materials already exist)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { withTransaction, close } = require('../src/db/pool');

async function seedDemo(c) {
  const exists = await c.query('select count(*)::int as n from public.materials');
  if (exists.rows[0].n > 0) return false;

  const ins = async (sql, params) => (await c.query(sql, params)).rows[0];
  const admin = await ins(`insert into public.user_profiles(full_name, email, role) values ('Admin User','admin@example.com','admin') returning id`);
  await c.query(`insert into public.user_profiles(full_name, email, role) values
                  ('Store Editor','editor@example.com','editor'), ('Read Only','viewer@example.com','viewer')`);
  const co = await ins(`insert into public.companies(name) values ('Demo Foods Pvt Ltd') returning id`);
  const mum = await ins(`insert into public.locations(company_id, code, name) values ($1,'MUM','Mumbai Plant') returning id`, [co.id]);
  const pun = await ins(`insert into public.locations(company_id, code, name) values ($1,'PUN','Pune Plant') returning id`, [co.id]);
  const mumWh1 = await ins(`insert into public.warehouses(location_id, code, name, is_default) values ($1,'WH-01','Mumbai Main',true) returning id`, [mum.id]);
  const mumWh2 = await ins(`insert into public.warehouses(location_id, code, name) values ($1,'WH-02','Mumbai FG Store') returning id`, [mum.id]);
  await ins(`insert into public.warehouses(location_id, code, name, is_default) values ($1,'WH-01','Pune Main',true) returning id`, [pun.id]);

  const ven1 = await ins(`insert into public.vendors(code, name, city) values ('V1001','Agro Grains Co','Nashik') returning id`);
  const ven2 = await ins(`insert into public.vendors(code, name, city) values ('V1002','PackRight Ltd','Pune') returning id`);

  const mat = async (code, name, cls, uom, shelf) => ins(
    `insert into public.materials(code, name, classification, uom, shelf_life_days) values ($1,$2,$3,$4,$5) returning id`,
    [code, name, cls, uom, shelf || null]);
  const rice = await mat('RM-RICE', 'Rice Flour', 'RAW_MATERIAL', 'kg', 180);
  const lentil = await mat('RM-LENTIL', 'Lentil Powder', 'RAW_MATERIAL', 'kg', 180);
  const pouch = await mat('PK-POUCH', 'Spouted Pouch 100g', 'PACKAGING', 'pcs', null);
  const fg = await mat('FG-RL1', 'Rice O Lentil 100g Pouch', 'FINISHED_GOOD', 'pcs', 270);

  const mpn = async (code, materialId, vendorId) => {
    const m = await ins(`insert into public.mpns(mpn_code, material_id) values ($1,$2) returning id`, [code, materialId]);
    if (vendorId) await c.query(`insert into public.mpn_vendors(mpn_id, vendor_id, is_preferred) values ($1,$2,true)`, [m.id, vendorId]);
    return m;
  };
  const riceMpn = await mpn('MPN-RICE-AG', rice.id, ven1.id);
  const lentilMpn = await mpn('MPN-LENTIL-AG', lentil.id, ven1.id);
  const pouchMpn = await mpn('MPN-POUCH-PR', pouch.id, ven2.id);
  await mpn('FG-RL1', fg.id, null);

  // BOM: 1 batch = 100 kg input -> 1000 pouches
  const bom = await ins(`insert into public.boms(product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                            expected_output_qty, output_uom, created_by)
                         values ($1,$2,$3,1,'ACTIVE',100,'kg',1000,'pcs',$4) returning id`, [fg.id, mum.id, mumWh2.id, admin.id]);
  const line = (n, m, p, q, uom, scrap) => c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct)
                                                   values ($1,$2,$3,$4,$5,$6,$7)`, [bom.id, n, m, p, q, uom, scrap]);
  await line(1, rice.id, riceMpn.id, 60, 'kg', 2);
  await line(2, lentil.id, lentilMpn.id, 40, 'kg', 2);
  await line(3, pouch.id, pouchMpn.id, 1000, 'pcs', 1);

  const post = (mpnId, lot, qty, mfg, exp, vendorId) => c.query(
    `select erp.post_stock('OPENING',$1,$2,$3,$4,$5,$6,'SEED',null,'Demo opening stock',$7,$8,$9,true)`,
    [mpnId, mum.id, mumWh1.id, lot, qty, admin.id, mfg, exp, vendorId]);
  await post(riceMpn.id, 'RICE-L1', 150, '2026-08-01', '2027-02-01', ven1.id);
  await post(riceMpn.id, 'RICE-L2', 80, '2026-09-01', '2027-03-01', ven1.id);
  await post(lentilMpn.id, 'LEN-L1', 100, '2026-08-15', '2027-02-15', ven1.id);
  await post(pouchMpn.id, 'POUCH-L1', 2500, '2026-07-01', null, ven2.id);
  await post(riceMpn.id, 'RICE-OLD', 20, '2025-01-01', '2025-07-01', ven1.id); // expired lot
  return true;
}

module.exports = { seedDemo };

if (require.main === module) {
  withTransaction(seedDemo)
    .then((done) => console.log(done ? '[seed] demo data created' : '[seed] skipped: data already exists'))
    .then(() => close())
    .catch(async (err) => { console.error('[seed] failed:', err.message); await close(); process.exit(1); });
}
