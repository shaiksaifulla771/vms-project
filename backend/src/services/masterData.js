/**
 * Master data write logic shared by the single-record routes and bulk entry / bulk update.
 * Every function takes a pg client that is already inside a transaction.
 */
const { badRequest, notFound } = require('../utils/errors');
const v = require('../utils/validate');
const { canonUom } = require('./options');

const CLASSES = ['RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD'];
const STATUSES = ['ACTIVE', 'INACTIVE'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PHONE_RE = /^[+0-9 ()-]{6,20}$/;

/** Record who is acting, so DB triggers (price history) can stamp it. */
async function actAs(c, userId) {
  await c.query(`select set_config('erp.user_id', $1, true)`, [userId || '']);
}

/**
 * Delete a master record; if other records still use it, deactivate it instead.
 * Codes are never reused either way (they come from sequences).
 */
async function deleteOrDeactivate(c, { table, id, label, userId, hasStatus = true, before = [] }) {
  const exists = (await c.query(`select 1 from public.${table} where id = $1`, [id])).rows[0];
  if (!exists) throw notFound(`${label} not found`);
  await c.query('savepoint del');
  try {
    for (const sql of before) await c.query(sql, [id]);
    await c.query(`delete from public.${table} where id = $1`, [id]);
    await c.query('release savepoint del');
    return { action: 'deleted' };
  } catch (err) {
    await c.query('rollback to savepoint del');
    if (err.code !== '23503' || !hasStatus) throw err;
    await c.query(`update public.${table} set status = 'INACTIVE', updated_by = $2 where id = $1`, [id, userId]);
    return { action: 'deactivated', reason: `${label} is used by other records, so it was set to Inactive instead of deleted.` };
  }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function parseMaterial(b, { partial = false } = {}) {
  const req = !partial;
  const out = {};
  const put = (k, val) => { if (!partial || b[k] !== undefined) out[k] = val; };
  put('name', v.str(b.name, 'Material name', { required: req, max: 300 }));
  put('classification', v.oneOf(b.classification, 'Classification', CLASSES, { required: req }));
  put('uom', v.str(b.uom, 'UOM', { required: req, max: 20 }));
  put('shelf_life_days', v.num(b.shelf_life_days, 'Shelf life (days)', { min: 1 }));
  put('reorder_level', v.num(b.reorder_level, 'Reorder level', { min: 0 }));
  put('status', v.oneOf(b.status, 'Status', STATUSES, { def: partial ? undefined : 'ACTIVE' }));
  put('category_id', v.uuid(b.category_id, 'Category'));
  put('sub_category_id', v.uuid(b.sub_category_id, 'Sub-category'));
  put('description', v.str(b.description, 'Description', { max: 2000 }));
  if (partial && out.status === undefined) delete out.status;
  if (partial && ['name', 'classification', 'uom'].some((k) => k in out && out[k] === null)) {
    throw badRequest('Name, classification and UOM cannot be empty');
  }
  return out;
}

async function createMaterial(c, d, userId, { legacyCode, mpnCode, vendorId } = {}) {
  d = { ...d, uom: await canonUom(c, d.uom, 'UOM', { required: true }) };
  const mat = (await c.query(`
    insert into public.materials(code, name, classification, uom, shelf_life_days, status, category_id, sub_category_id,
                                 description, created_by, reorder_level)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
  [legacyCode || null, d.name, d.classification, d.uom, d.shelf_life_days, d.status || 'ACTIVE', d.category_id,
    d.sub_category_id, d.description, userId, d.reorder_level ?? null])).rows[0];
  // Finished / semi-finished goods get an MPN automatically so they can hold stock.
  if (mpnCode || vendorId || ['FINISHED_GOOD', 'SEMI_FINISHED'].includes(mat.classification)) {
    const mpn = (await c.query(`insert into public.mpns(mpn_code, material_id, created_by) values ($1,$2,$3) returning id`,
      [mpnCode || null, mat.id, userId])).rows[0];
    if (vendorId) {
      await c.query(`insert into public.mpn_vendors(mpn_id, vendor_id, is_preferred, uom, created_by) values ($1,$2,true,$3,$4)`,
        [mpn.id, vendorId, mat.uom, userId]);
      await linkVendorMaterial(c, vendorId, mat.id, userId);
    }
  }
  return mat;
}

async function updateMaterial(c, id, d, userId) {
  d = { ...d };
  const cur = (await c.query(`select m.uom, m.classification, m.category_id, c.classification as category_class
                                from public.materials m left join public.material_categories c on c.id = m.category_id
                               where m.id = $1`, [id])).rows[0];
  if (!cur) throw notFound('Material not found');
  if ('uom' in d) d.uom = await canonUom(c, d.uom, 'UOM', { required: true, current: cur.uom });
  // A new classification drops a category that belongs to another classification.
  if (d.classification && d.classification !== cur.classification && !('category_id' in d)
      && cur.category_class && cur.category_class !== d.classification) {
    d.category_id = null;
  }
  const cols = Object.keys(d);
  if (!cols.length) return (await c.query('select * from public.materials where id = $1', [id])).rows[0];
  // Changing the category clears a sub-category that no longer belongs to it.
  if ('category_id' in d && !('sub_category_id' in d)) { cols.push('sub_category_id'); d.sub_category_id = null; }
  const params = [id, ...cols.map((k) => d[k]), userId];
  const sets = cols.map((k, i) => `${k} = $${i + 2}`);
  const r = (await c.query(`update public.materials set ${sets.join(', ')}, updated_by = $${params.length} where id = $1 returning *`,
    params)).rows[0];
  if (!r) throw notFound('Material not found');
  return r;
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
const VENDOR_BASIC = ['name', 'status', 'phone', 'contact_email', 'gstin', 'fssai_no', 'fssai_expiry'];

function parseVendorBasic(b, { partial = false } = {}) {
  const out = {};
  const put = (k, val) => { if (!partial || b[k] !== undefined) out[k] = val; };
  put('name', v.str(b.name, 'Vendor name', { required: !partial, max: 300 }));
  if (b.status !== undefined || !partial) put('status', v.oneOf(b.status, 'Status', STATUSES, { def: 'ACTIVE' }));
  const phone = v.str(b.phone, 'Phone', { max: 30 });
  if (phone && !PHONE_RE.test(phone)) throw badRequest('Phone number looks invalid');
  put('phone', phone);
  const email = v.str(b.contact_email, 'Email', { max: 200 });
  if (email && !EMAIL_RE.test(email)) throw badRequest('Email address looks invalid');
  put('contact_email', email);
  const gstin = v.str(b.gstin, 'GSTIN', { max: 15 })?.toUpperCase() || null;
  if (gstin && !GSTIN_RE.test(gstin)) throw badRequest('GSTIN must be 15 characters, e.g. 27AAPFU0939F1ZV');
  put('gstin', gstin);
  put('fssai_no', v.str(b.fssai_no, 'FSSAI licence no.', { max: 20 }));
  put('fssai_expiry', v.date(b.fssai_expiry, 'FSSAI expiry'));
  if (partial && out.name === null) throw badRequest('Vendor name cannot be empty');
  return out;
}

function parseAddresses(list) {
  if (list === undefined) return undefined;
  v.objList(list, 'Addresses', { max: 100 });
  const out = list.map((a, i) => {
    const n = `Address ${i + 1}`;
    const gstin = v.str(a.gstin, `${n} GSTIN`, { max: 15 })?.toUpperCase() || null;
    if (gstin && !GSTIN_RE.test(gstin)) throw badRequest(`${n}: GSTIN must be 15 characters`);
    const pin = v.str(a.pincode, `${n} PIN`, { max: 10 });
    if (pin && !/^[0-9]{6}$/.test(pin) && (a.country || 'India') === 'India') throw badRequest(`${n}: PIN code must be 6 digits`);
    return {
      address_name: v.str(a.address_name, `${n} name`, { required: true, max: 100 }),
      address_type: v.oneOf(a.address_type, `${n} type`, ['PRIMARY', 'SECONDARY'], { def: 'PRIMARY' }),
      is_default: v.bool(a.is_default),
      line1: v.str(a.line1, `${n} line 1`, { max: 300 }),
      line2: v.str(a.line2, `${n} line 2`, { max: 300 }),
      city: v.str(a.city, `${n} city`, { max: 100 }),
      state: v.str(a.state, `${n} state`, { max: 100 }),
      pincode: pin,
      country: v.str(a.country, `${n} country`, { max: 100 }) || 'India',
      gstin,
    };
  });
  const names = new Set();
  for (const a of out) {
    const k = a.address_name.toLowerCase();
    if (names.has(k)) throw badRequest(`Two addresses are named "${a.address_name}"`);
    names.add(k);
  }
  const defaults = out.filter((a) => a.is_default).length;
  if (defaults > 1) throw badRequest('Only one address can be the default');
  if (out.length && defaults === 0) out[0].is_default = true;
  return out;
}

function parseContacts(list) {
  if (list === undefined) return undefined;
  v.objList(list, 'Contacts', { max: 100 });
  return list.map((x, i) => {
    const n = `Contact ${i + 1}`;
    const email = v.str(x.email, `${n} email`, { max: 200 });
    if (email && !EMAIL_RE.test(email)) throw badRequest(`${n}: email looks invalid`);
    const phone = v.str(x.phone, `${n} phone`, { max: 30 });
    if (phone && !PHONE_RE.test(phone)) throw badRequest(`${n}: phone looks invalid`);
    return {
      name: v.str(x.name, `${n} name`, { required: true, max: 200 }),
      designation: v.str(x.designation, `${n} designation`, { max: 100 }),
      phone,
      email,
    };
  });
}

function parseBanks(list) {
  if (list === undefined) return undefined;
  v.objList(list, 'Bank accounts', { max: 100 });
  const out = list.map((x, i) => {
    const n = `Bank account ${i + 1}`;
    const acct = String(v.str(x.account_number, `${n} number`, { required: true, max: 20 })).replace(/\s/g, '');
    if (!/^[0-9]{6,20}$/.test(acct)) throw badRequest(`${n}: account number must be 6-20 digits`);
    const ifsc = v.str(x.ifsc, `${n} IFSC`, { required: true, max: 11 }).toUpperCase();
    if (!IFSC_RE.test(ifsc)) throw badRequest(`${n}: IFSC must look like HDFC0001234`);
    return {
      account_holder: v.str(x.account_holder, `${n} holder name`, { required: true, max: 200 }),
      account_number: acct,
      ifsc,
      bank_name: v.str(x.bank_name, `${n} bank name`, { max: 200 }),
      branch: v.str(x.branch, `${n} branch`, { max: 200 }),
      is_primary: v.bool(x.is_primary),
    };
  });
  const prim = out.filter((x) => x.is_primary).length;
  if (prim > 1) throw badRequest('Only one bank account can be primary');
  if (out.length && prim === 0) out[0].is_primary = true;
  return out;
}

function parseVendor(b, opts) {
  return {
    basic: parseVendorBasic(b, opts),
    addresses: parseAddresses(b.addresses),
    contacts: parseContacts(b.contacts),
    banks: parseBanks(b.bank_accounts),
    // Supplied materials are no longer set on the vendor: they come from MPNs (v6).
  };
}

async function linkVendorMaterial(c, vendorId, materialId, userId) {
  await c.query(`insert into public.vendor_materials(vendor_id, material_id, created_by) values ($1,$2,$3) on conflict do nothing`,
    [vendorId, materialId, userId]);
}

async function writeVendorChildren(c, vendorId, d, userId) {
  if (d.addresses) {
    await c.query('delete from public.vendor_addresses where vendor_id = $1', [vendorId]);
    let i = 0;
    for (const a of d.addresses) {
      await c.query(`insert into public.vendor_addresses(vendor_id, address_name, address_type, is_default, line1, line2, city,
                       state, pincode, country, gstin, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [vendorId, a.address_name, a.address_type, a.is_default, a.line1, a.line2, a.city, a.state, a.pincode, a.country, a.gstin, i]);
      i += 1;
    }
    // Keep the legacy single-address columns in step with the default address.
    const def = d.addresses.find((a) => a.is_default);
    await c.query(`update public.vendors set address = $2, city = $3, state = $4, country = $5 where id = $1`,
      [vendorId, def ? [def.line1, def.line2].filter(Boolean).join(', ') || null : null, def?.city || null,
        def?.state || null, def?.country || null]);
  }
  if (d.contacts) {
    await c.query('delete from public.vendor_contacts where vendor_id = $1', [vendorId]);
    let i = 0;
    for (const x of d.contacts) {
      await c.query(`insert into public.vendor_contacts(vendor_id, name, designation, phone, email, sort_order)
                     values ($1,$2,$3,$4,$5,$6)`, [vendorId, x.name, x.designation, x.phone, x.email, i]);
      i += 1;
    }
  }
  if (d.banks) {
    await c.query('delete from public.vendor_bank_accounts where vendor_id = $1', [vendorId]);
    for (const x of d.banks) {
      await c.query(`insert into public.vendor_bank_accounts(vendor_id, account_holder, account_number, ifsc, bank_name, branch, is_primary)
                     values ($1,$2,$3,$4,$5,$6,$7)`,
      [vendorId, x.account_holder, x.account_number, x.ifsc, x.bank_name, x.branch, x.is_primary]);
    }
  }
}

async function createVendor(c, d, userId, { legacyCode } = {}) {
  const b = d.basic;
  const row = (await c.query(`insert into public.vendors(code, name, status, phone, contact_email, gstin, fssai_no, fssai_expiry, created_by)
                              values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
  [legacyCode || null, b.name, b.status || 'ACTIVE', b.phone, b.contact_email, b.gstin, b.fssai_no, b.fssai_expiry, userId])).rows[0];
  await writeVendorChildren(c, row.id, d, userId);
  return row;
}

async function updateVendor(c, id, d, userId) {
  const cols = Object.keys(d.basic).filter((k) => VENDOR_BASIC.includes(k));
  const params = [id, ...cols.map((k) => d.basic[k]), userId];
  const sets = cols.map((k, i) => `${k} = $${i + 2}`);
  const r = (await c.query(`update public.vendors set ${[...sets, `updated_by = $${params.length}`].join(', ')} where id = $1 returning *`,
    params)).rows[0];
  if (!r) throw notFound('Vendor not found');
  await writeVendorChildren(c, id, d, userId);
  return r;
}

// ---------------------------------------------------------------------------
// MPNs and MPN-vendor terms
// ---------------------------------------------------------------------------
function parseMpnVendors(list) {
  if (list === undefined) return undefined;
  v.objList(list, 'Vendors', { max: 100 });
  const seen = new Set();
  const out = list.map((x, i) => {
    const n = `Vendor ${i + 1}`;
    const vendorId = v.uuid(x.vendor_id, `${n}`, { required: true });
    if (seen.has(vendorId)) throw badRequest('A vendor is listed twice');
    seen.add(vendorId);
    return {
      vendorId,
      preferred: v.bool(x.is_preferred),
      lead: v.num(x.lead_time_days, `${n} lead time`, { min: 0 }),
      uom: v.str(x.uom, `${n} UOM`, { max: 20 }),
      moq: v.num(x.moq, `${n} MOQ`, { gt: 0 }),
      price: v.num(x.price, `${n} price`, { min: 0 }),
    };
  });
  if (out.filter((x) => x.preferred).length > 1) throw badRequest('Only one preferred vendor per MPN');
  if (out.length && !out.some((x) => x.preferred)) out[0].preferred = true;
  return out;
}

/** Upsert vendor terms (keeps price history), removing vendors no longer listed. */
async function writeMpnVendors(c, mpnId, vendors, userId) {
  const mpn = (await c.query('select material_id from public.mpns where id = $1', [mpnId])).rows[0];
  const current = new Map((await c.query('select vendor_id, uom from public.mpn_vendors where mpn_id = $1', [mpnId])).rows
    .map((r) => [r.vendor_id, r.uom]));
  for (const x of vendors) x.uom = await canonUom(c, x.uom, 'Vendor UOM', { current: current.get(x.vendorId) });
  await c.query('delete from public.mpn_vendors where mpn_id = $1 and not (vendor_id = any($2::uuid[]))',
    [mpnId, vendors.map((x) => x.vendorId)]);
  await c.query('update public.mpn_vendors set is_preferred = false where mpn_id = $1 and is_preferred', [mpnId]);
  for (const x of vendors) {
    await c.query(`insert into public.mpn_vendors(mpn_id, vendor_id, is_preferred, lead_time_days, uom, moq, price, created_by)
                   values ($1,$2,$3,$4,$5,$6,$7,$8)
                   on conflict (mpn_id, vendor_id) do update
                     set is_preferred = excluded.is_preferred, lead_time_days = excluded.lead_time_days,
                         uom = excluded.uom, moq = excluded.moq, price = excluded.price`,
    [mpnId, x.vendorId, x.preferred, x.lead, x.uom, x.moq, x.price, userId]);
    await linkVendorMaterial(c, x.vendorId, mpn.material_id, userId);
  }
}

/** Finished goods keep only a hidden internal stock code; it cannot be edited as an MPN. */
async function assertNotFinishedGoodMpn(c, mpnId) {
  const r = (await c.query(`select m.classification from public.mpns p join public.materials m on m.id = p.material_id where p.id = $1`, [mpnId])).rows[0];
  if (r && r.classification === 'FINISHED_GOOD') throw badRequest('Finished goods are made, not bought: they have no MPN');
}

async function createMpn(c, { materialId, manufacturer, description, vendors, legacyCode, hsnCode }, userId) {
  const mat = (await c.query('select id, status, classification from public.materials where id = $1', [materialId])).rows[0];
  if (!mat) throw badRequest('Material not found');
  if (mat.classification === 'FINISHED_GOOD') throw badRequest('Finished goods are made, not bought: they have no MPN');
  const mpn = (await c.query(`insert into public.mpns(mpn_code, material_id, manufacturer, description, created_by, hsn_code)
                              values ($1,$2,$3,$4,$5,$6) returning *`,
  [legacyCode || null, materialId, manufacturer, description, userId, hsnCode || null])).rows[0];
  if (vendors?.length) await writeMpnVendors(c, mpn.id, vendors, userId);
  return mpn;
}

/** The MPN a vendor already supplies for a material, if any. */
async function existingMpnFor(c, materialId, vendorId) {
  return (await c.query(`select p.id, p.mpn_code from public.mpns p join public.mpn_vendors mv on mv.mpn_id = p.id
                          where p.material_id = $1 and mv.vendor_id = $2 limit 1`, [materialId, vendorId])).rows[0];
}

module.exports = {
  CLASSES, STATUSES, EMAIL_RE, IFSC_RE, GSTIN_RE,
  actAs, deleteOrDeactivate,
  parseMaterial, createMaterial, updateMaterial,
  parseVendor, parseVendorBasic, createVendor, updateVendor, linkVendorMaterial, assertNotFinishedGoodMpn,
  parseMpnVendors, writeMpnVendors, createMpn, existingMpnFor,
};
