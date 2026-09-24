const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

const mask = (acct) => (acct ? `${'X'.repeat(Math.max(0, acct.length - 4))}${acct.slice(-4)}` : acct);

router.get('/', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const { clause, params } = where([
    ['(v.code ilike ? or v.name ilike ? or v.gstin ilike ?)', q],
    ['v.status = ?', req.query.status],
    // Vendors that supply a material = vendors with an MPN for it (MPN is the only vendor-material link)
    [`exists (select 1 from public.mpn_vendors x join public.mpns p on p.id = x.mpn_id where x.vendor_id = v.id and p.material_id = ?)`, req.query.material_id],
  ]);
  const { rows } = await query(`
    select v.*,
           (select count(*) from public.mpn_vendors mv where mv.vendor_id = v.id)::int as mpn_count,
           (select count(distinct p.material_id) from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id
             where mv.vendor_id = v.id)::int as material_count,
           (select a.address_name || coalesce(' - ' || a.city, '') from public.vendor_addresses a
             where a.vendor_id = v.id and a.is_default) as default_address,
           (select c.name from public.vendor_contacts c where c.vendor_id = v.id order by c.sort_order limit 1) as primary_contact
      from public.vendors v ${clause} order by v.code`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const vendor = (await query('select * from public.vendors where id = $1', [id])).rows[0];
  if (!vendor) throw notFound('Vendor not found');
  const [mpns, addresses, contacts, banks, materials] = await Promise.all([
    query(`select p.id, p.mpn_code, m.code as material_code, m.name as material_name, mv.is_preferred, mv.lead_time_days,
                  mv.uom, mv.moq, mv.price, mv.currency
             from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id join public.materials m on m.id = p.material_id
            where mv.vendor_id = $1 order by p.mpn_code`, [id]),
    query('select * from public.vendor_addresses where vendor_id = $1 order by sort_order, created_at', [id]),
    query('select * from public.vendor_contacts where vendor_id = $1 order by sort_order, created_at', [id]),
    query('select * from public.vendor_bank_accounts where vendor_id = $1 order by is_primary desc, created_at', [id]),
    // Materials this vendor supplies, from its MPNs
    query(`select distinct m.id, m.code, m.name, m.classification, m.uom from public.mpn_vendors mv
             join public.mpns p on p.id = mv.mpn_id join public.materials m on m.id = p.material_id
            where mv.vendor_id = $1 order by m.code`, [id]),
  ]);
  // Older manual links (made before v6 without an MPN, so without a price) are shown so they can be turned into MPNs.
  const unpriced = (await query(`
    select m.id, m.code, m.name, m.classification, m.uom from public.vendor_materials vm join public.materials m on m.id = vm.material_id
     where vm.vendor_id = $1 and not exists (select 1 from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id
                                              where mv.vendor_id = vm.vendor_id and p.material_id = vm.material_id)
     order by m.code`, [id])).rows;
  // Full account numbers only when the caller is going to edit (?full=true); masked otherwise.
  const full = req.query.full === 'true';
  res.json({
    ...vendor,
    mpns: mpns.rows,
    addresses: addresses.rows,
    contacts: contacts.rows,
    bank_accounts: banks.rows.map((b) => (full ? b : { ...b, account_number: mask(b.account_number) })),
    materials: materials.rows,
    unpriced_links: unpriced,
  });
}));

router.post('/', h(async (req, res) => {
  const b = { ...(req.body || {}) };
  if (!b.addresses && (b.address || b.city || b.state)) { // older clients send one flat address
    b.addresses = [{ address_name: 'Head Office', line1: b.address, city: b.city, state: b.state, country: b.country, gstin: b.gstin }];
  }
  const d = md.parseVendor(b);
  const legacyCode = v.str(b.code, 'Vendor code', { max: 40 })?.toUpperCase();
  const row = await withTransaction((c) => md.createVendor(c, d, req.user.id, { legacyCode }));
  res.status(201).json(row);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const d = md.parseVendor(b, { partial: true });
  // Legacy single-address fields are still accepted from older clients.
  const legacy = {};
  for (const f of ['address', 'city', 'state', 'country']) if (b[f] !== undefined) legacy[f] = v.str(b[f], f, { max: 1000 });
  const row = await withTransaction(async (c) => {
    const r = await md.updateVendor(c, id, d, req.user.id);
    const keys = Object.keys(legacy);
    if (keys.length && !d.addresses) {
      await c.query(`update public.vendors set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
        [id, ...keys.map((k) => legacy[k])]);
    }
    return r;
  });
  res.json(row);
}));

router.delete('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const out = await withTransaction((c) => md.deleteOrDeactivate(c, { table: 'vendors', id, label: 'Vendor', userId: req.user.id }));
  res.json(out);
}));

module.exports = router;
