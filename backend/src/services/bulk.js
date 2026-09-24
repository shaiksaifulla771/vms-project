/**
 * Bulk Entry / Bulk Update / Export for Materials, Vendors and MPNs.
 *
 * Flow: template (xlsx) -> user fills it -> parse -> preview (row-by-row validation, or a
 * list of changed fields for updates) -> commit. Commit re-validates inside one transaction
 * and saves every row or none.
 */
const ExcelJS = require('exceljs');
const { query } = require('../db/pool');
const { badRequest } = require('../utils/errors');
const md = require('./masterData');
const { loadUoms, matchUom, STATES } = require('./options');

const MAX_ROWS = 2000;

// --- value helpers ----------------------------------------------------------
const CLASS_LABEL = {
  RAW_MATERIAL: 'Raw Material', PACKAGING: 'Packaging', CONSUMABLE: 'Consumable',
  SEMI_FINISHED: 'Semi-Finished', FINISHED_GOOD: 'Finished Good',
};
const STATUS_LABEL = { ACTIVE: 'Active', INACTIVE: 'Inactive' };

const blank = (x) => x === undefined || x === null || String(x).trim() === '';
const text = (x) => (blank(x) ? null : String(x).trim());
const norm = (x) => (blank(x) ? '' : String(x).trim().toLowerCase().replace(/[\s_-]+/g, ' '));

function fromLabel(map, x) {
  if (blank(x)) return null;
  const n = norm(x);
  for (const [code, label] of Object.entries(map)) if (norm(code) === n || norm(label) === n) return code;
  return undefined; // unknown value
}
function yesNo(x) {
  if (blank(x)) return null;
  const n = norm(x);
  if (['y', 'yes', 'true', '1'].includes(n)) return true;
  if (['n', 'no', 'false', '0'].includes(n)) return false;
  return undefined;
}
function toNum(x) {
  if (blank(x)) return null;
  const n = Number(String(x).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}
function toDate(x) {
  if (blank(x)) return null;
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  const s = String(x).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}
const same = (a, b) => (blank(a) && blank(b)) || String(a ?? '').trim() === String(b ?? '').trim()
  || (toNum(a) !== undefined && toNum(b) !== undefined && toNum(a) !== null && toNum(a) === toNum(b));

/** Run a parser that throws AppError and turn it into a list of messages. */
function capture(errors, fn) {
  try { return fn(); } catch (e) { errors.push(e.message); return null; }
}

// --- lookups ----------------------------------------------------------------
async function loadLookups(db) {
  // One after another: a pg client inside a transaction runs one query at a time.
  const cats = await db.query('select id, name, parent_id, status, classification from public.material_categories order by lower(name)');
  const mats = await db.query('select id, code, name, status, uom, classification, category_id, sub_category_id, shelf_life_days, description from public.materials');
  const vens = await db.query('select id, code, name, status, phone, contact_email, gstin, fssai_no, fssai_expiry from public.vendors');
  const mpns = await db.query(`select mv.id as mv_id, p.id as mpn_id, p.mpn_code, p.status, p.manufacturer, p.material_id, mv.vendor_id,
                     mv.uom, mv.moq, mv.price, mv.lead_time_days, mv.is_preferred
                from public.mpns p left join public.mpn_vendors mv on mv.mpn_id = p.id`);
  const uoms = await loadUoms(db);

  const catTop = new Map();
  const catSub = new Map();
  const catById = new Map(cats.rows.map((c) => [c.id, c]));
  for (const c of cats.rows) {
    if (c.parent_id) catSub.set(`${c.parent_id}|${norm(c.name)}`, c);
    else catTop.set(norm(c.name), c);
  }
  const byCode = (rows) => new Map(rows.map((r) => [String(r.code).toUpperCase(), r]));
  return {
    catTop, catSub, catById, cats: cats.rows, uoms,
    matByCode: byCode(mats.rows), matById: new Map(mats.rows.map((m) => [m.id, m])),
    matNames: new Map(mats.rows.map((m) => [norm(m.name), m])),
    venByCode: byCode(vens.rows), venById: new Map(vens.rows.map((x) => [x.id, x])),
    venNames: new Map(vens.rows.map((x) => [norm(x.name), x])),
    mpnRows: mpns.rows,
  };
}

// ============================================================================
// Entity definitions
// ============================================================================
const MATERIAL_COLS = [
  { key: 'name', header: 'Material Name', required: true, width: 34 },
  { key: 'classification', header: 'Classification', required: true, width: 16, list: Object.values(CLASS_LABEL) },
  { key: 'category', header: 'Category', width: 24, dyn: 'category' },
  { key: 'sub_category', header: 'Sub-category', width: 22, dyn: 'subcategory' },
  { key: 'uom', header: 'UOM', required: true, width: 9, dyn: 'uom' },
  { key: 'shelf_life_days', header: 'Shelf Life (days)', width: 14 },
  { key: 'status', header: 'Status', width: 10, list: Object.values(STATUS_LABEL) },
  { key: 'description', header: 'Description', width: 40 },
];

const VENDOR_COLS = [
  { key: 'name', header: 'Vendor Name', required: true, width: 30 },
  { key: 'status', header: 'Status', width: 10, list: Object.values(STATUS_LABEL) },
  { key: 'phone', header: 'Phone', width: 14 },
  { key: 'contact_email', header: 'Email', width: 26 },
  { key: 'gstin', header: 'GSTIN', width: 18 },
  { key: 'fssai_no', header: 'FSSAI Licence No', width: 18 },
  { key: 'fssai_expiry', header: 'FSSAI Expiry (YYYY-MM-DD)', width: 16 },
  { key: 'address_name', header: 'Address Name', width: 16, createOnly: true },
  { key: 'line1', header: 'Address Line 1', width: 28, createOnly: true },
  { key: 'line2', header: 'Address Line 2', width: 20, createOnly: true },
  { key: 'city', header: 'City', width: 14, createOnly: true },
  { key: 'state', header: 'State', width: 18, createOnly: true, dyn: 'state' },
  { key: 'pincode', header: 'PIN Code', width: 10, createOnly: true },
  { key: 'contact_name', header: 'Contact Name', width: 20, createOnly: true },
  { key: 'contact_designation', header: 'Contact Designation', width: 16, createOnly: true },
  { key: 'contact_phone', header: 'Contact Phone', width: 14, createOnly: true },
  { key: 'contact_email2', header: 'Contact Email', width: 22, createOnly: true },
  { key: 'account_holder', header: 'Account Holder Name', width: 22, createOnly: true },
  { key: 'account_number', header: 'Account Number', width: 18, createOnly: true, textCell: true },
  { key: 'ifsc', header: 'IFSC', width: 13, createOnly: true },
  { key: 'bank_name', header: 'Bank Name', width: 18, createOnly: true },
  { key: 'branch', header: 'Branch', width: 16, createOnly: true },
  { key: 'material_codes', header: 'Supplied Material Codes (comma separated)', width: 30, createOnly: true },
];

const MPN_COLS = [
  { key: 'material_code', header: 'Material Code', required: true, width: 16 },
  { key: 'vendor_code', header: 'Vendor Code', required: true, width: 14 },
  { key: 'uom', header: 'UOM', required: true, width: 9, dyn: 'uom' },
  { key: 'moq', header: 'MOQ', required: true, width: 10 },
  { key: 'price', header: 'Price (INR)', required: true, width: 12 },
  { key: 'lead_time_days', header: 'Lead Time (days)', width: 14 },
  { key: 'manufacturer', header: 'Manufacturer', width: 22 },
];
const MPN_UPDATE_COLS = [
  { key: 'mpn_code', header: 'MPN Code', required: true, width: 14, isKey: true },
  { key: 'vendor_code', header: 'Vendor Code', required: true, width: 14, isKey: true },
  { key: 'material_code', header: 'Material Code', width: 16, readOnly: true },
  { key: 'material_name', header: 'Material Name', width: 30, readOnly: true },
  { key: 'uom', header: 'UOM', width: 9, dyn: 'uom' },
  { key: 'moq', header: 'MOQ', width: 10 },
  { key: 'price', header: 'Price (INR)', width: 12 },
  { key: 'lead_time_days', header: 'Lead Time (days)', width: 14 },
  { key: 'is_preferred', header: 'Preferred (Yes/No)', width: 12, list: ['Yes', 'No'] },
  { key: 'manufacturer', header: 'Manufacturer', width: 22 },
  { key: 'status', header: 'MPN Status', width: 10, list: Object.values(STATUS_LABEL) },
];

function columns(entity, mode) {
  if (entity === 'materials') {
    return mode === 'update'
      ? [{ key: 'code', header: 'Material Code', required: true, width: 14, isKey: true }, ...MATERIAL_COLS.map((c) => ({ ...c, required: false }))]
      : MATERIAL_COLS;
  }
  if (entity === 'vendors') {
    return mode === 'update'
      ? [{ key: 'code', header: 'Vendor Code', required: true, width: 14, isKey: true },
        ...VENDOR_COLS.filter((c) => !c.createOnly).map((c) => ({ ...c, required: false }))]
      : VENDOR_COLS;
  }
  if (entity === 'mpns') return mode === 'update' ? MPN_UPDATE_COLS : MPN_COLS;
  throw badRequest('Unknown entity');
}

// ============================================================================
// Materials
// ============================================================================
/** Active top-level categories a classification may use (its own + unassigned ones). */
function categoriesFor(lk, cls) {
  return lk.cats.filter((c) => !c.parent_id && c.status === 'ACTIVE' && (!cls || !c.classification || c.classification === cls));
}
const listOf = (names) => (names.length ? names.join(', ') : 'none yet - add them under Settings > Categories');

function resolveCategory(lk, r, errors, cls) {
  let categoryId = null;
  let subId = null;
  const clsLabel = cls ? CLASS_LABEL[cls] : null;
  if (!blank(r.category)) {
    const cat = lk.catTop.get(norm(r.category));
    const choices = listOf(categoriesFor(lk, cls).map((c) => c.name));
    if (!cat) {
      errors.push(`Category "${r.category}" does not exist${clsLabel ? ` for ${clsLabel}` : ''}. Choose one of: ${choices}`);
    } else if (cls && cat.classification && cat.classification !== cls) {
      errors.push(`Category "${cat.name}" is a ${CLASS_LABEL[cat.classification]} category, not ${clsLabel}. Choose one of: ${choices}`);
    } else categoryId = cat.id;
  }
  if (!blank(r.sub_category)) {
    if (!categoryId) {
      if (blank(r.category)) errors.push('Sub-category needs a Category');
    } else {
      const sub = lk.catSub.get(`${categoryId}|${norm(r.sub_category)}`);
      const subs = lk.cats.filter((c) => c.parent_id === categoryId && c.status === 'ACTIVE').map((c) => c.name);
      if (!sub) errors.push(`Sub-category "${r.sub_category}" is not under "${lk.catById.get(categoryId).name}". Choose one of: ${listOf(subs)}`);
      else subId = sub.id;
    }
  }
  return { categoryId, subId };
}

function validateMaterialCreate(rows, lk) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = [];
    const cls = fromLabel(CLASS_LABEL, r.classification);
    if (cls === undefined) errors.push(`Classification must be one of: ${Object.values(CLASS_LABEL).join(', ')}`);
    const status = fromLabel(STATUS_LABEL, r.status);
    if (status === undefined) errors.push('Status must be Active or Inactive');
    const shelf = toNum(r.shelf_life_days);
    if (shelf === undefined) errors.push('Shelf life must be a number');
    const { categoryId, subId } = resolveCategory(lk, r, errors, cls || null);
    const uom = blank(r.uom) ? null : matchUom(lk.uoms, r.uom, 'UOM', { errors });
    const data = capture(errors, () => md.parseMaterial({
      // an invalid classification / UOM is already reported above; don't report it twice
      name: text(r.name), classification: cls === undefined ? 'RAW_MATERIAL' : (cls || null), uom: uom || text(r.uom), shelf_life_days: shelf ?? null,
      status: status || 'ACTIVE', category_id: categoryId, sub_category_id: subId, description: text(r.description),
    }));
    const key = norm(r.name);
    if (key) {
      if (seen.has(key)) errors.push(`Same material name as row ${seen.get(key)}`);
      else seen.set(key, r.row_no);
      const ex = lk.matNames.get(key);
      if (ex) errors.push(`A material named "${ex.name}" already exists (${ex.code})`);
    }
    return { row_no: r.row_no, values: r, data, errors, action: 'create' };
  });
}

function validateMaterialUpdate(rows, lk) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = [];
    const code = text(r.code)?.toUpperCase();
    const ex = code ? lk.matByCode.get(code) : null;
    if (!code) errors.push('Material Code is required');
    else if (!ex) errors.push(`Material ${code} not found`);
    else if (seen.has(code)) errors.push(`Material ${code} is repeated (row ${seen.get(code)})`);
    if (code) seen.set(code, r.row_no);
    if (!ex) return { row_no: r.row_no, values: r, errors, changes: [], action: 'update' };

    const patch = {};
    const changes = [];
    const add = (field, label, from, to, value) => { patch[field] = value; changes.push({ field: label, from, to }); };
    if (!blank(r.name) && !same(r.name, ex.name)) add('name', 'Name', ex.name, text(r.name), text(r.name));
    if (!blank(r.classification)) {
      const cls = fromLabel(CLASS_LABEL, r.classification);
      if (cls === undefined) errors.push('Unknown classification');
      else if (cls !== ex.classification) add('classification', 'Classification', CLASS_LABEL[ex.classification], CLASS_LABEL[cls], cls);
    }
    if (!blank(r.uom) && !same(r.uom, ex.uom)) {
      const u = matchUom(lk.uoms, r.uom, 'UOM', { errors, current: ex.uom });
      if (u && u !== ex.uom) add('uom', 'UOM', ex.uom, u, u);
    }
    if (!blank(r.shelf_life_days)) {
      const n = toNum(r.shelf_life_days);
      if (n === undefined) errors.push('Shelf life must be a number');
      else if (!same(n, ex.shelf_life_days)) add('shelf_life_days', 'Shelf life', ex.shelf_life_days, n, n);
    }
    if (!blank(r.status)) {
      const s = fromLabel(STATUS_LABEL, r.status);
      if (s === undefined) errors.push('Status must be Active or Inactive');
      else if (s !== ex.status) add('status', 'Status', STATUS_LABEL[ex.status], STATUS_LABEL[s], s);
    }
    if (!blank(r.description) && !same(r.description, ex.description)) add('description', 'Description', ex.description, text(r.description), text(r.description));
    const newCls = patch.classification || ex.classification;
    const exCat = lk.catById.get(ex.category_id);
    if (patch.classification && blank(r.category) && exCat?.classification && exCat.classification !== newCls) {
      // Old category belongs to the old classification: it is cleared (same as the form does).
      add('category_id', 'Category', exCat.name, null, null);
    }
    if (!blank(r.category) || !blank(r.sub_category)) {
      const { categoryId, subId } = resolveCategory(lk, { category: r.category || exCat?.name, sub_category: r.sub_category }, errors, newCls);
      if (categoryId && categoryId !== ex.category_id) {
        add('category_id', 'Category', lk.catById.get(ex.category_id)?.name || null, lk.catById.get(categoryId).name, categoryId);
        patch.sub_category_id = subId;
      }
      if (subId !== undefined && !blank(r.sub_category) && subId && subId !== ex.sub_category_id) {
        add('sub_category_id', 'Sub-category', lk.catById.get(ex.sub_category_id)?.name || null, lk.catById.get(subId).name, subId);
      }
    }
    capture(errors, () => md.parseMaterial(patch, { partial: true }));
    return { row_no: r.row_no, values: r, id: ex.id, code: ex.code, patch, changes, errors, action: changes.length ? 'update' : 'unchanged' };
  });
}

// ============================================================================
// Vendors
// ============================================================================
function validateVendorCreate(rows, lk) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = [];
    const status = fromLabel(STATUS_LABEL, r.status);
    if (status === undefined) errors.push('Status must be Active or Inactive');
    const expiry = toDate(r.fssai_expiry);
    if (expiry === undefined) errors.push('FSSAI expiry must be a date (YYYY-MM-DD)');
    const hasAddr = ['line1', 'line2', 'city', 'state', 'pincode'].some((k) => !blank(r[k]));
    const hasContact = ['contact_name', 'contact_phone', 'contact_email2', 'contact_designation'].some((k) => !blank(r[k]));
    const hasBank = ['account_holder', 'account_number', 'ifsc', 'bank_name', 'branch'].some((k) => !blank(r[k]));
    const materialIds = [];
    for (const code of String(r.material_codes || '').split(/[,;\n]/).map((s) => s.trim().toUpperCase()).filter(Boolean)) {
      const m = lk.matByCode.get(code);
      if (!m) errors.push(`Material ${code} not found`);
      else materialIds.push(m.id);
    }
    const data = capture(errors, () => md.parseVendor({
      name: text(r.name), status: status || 'ACTIVE', phone: text(r.phone), contact_email: text(r.contact_email),
      gstin: text(r.gstin), fssai_no: text(r.fssai_no), fssai_expiry: expiry || null,
      addresses: hasAddr ? [{ address_name: text(r.address_name) || 'Head Office', address_type: 'PRIMARY', is_default: true,
        line1: text(r.line1), line2: text(r.line2), city: text(r.city), state: text(r.state), pincode: text(r.pincode) }] : [],
      contacts: hasContact ? [{ name: text(r.contact_name), designation: text(r.contact_designation),
        phone: text(r.contact_phone), email: text(r.contact_email2) }] : [],
      bank_accounts: hasBank ? [{ account_holder: text(r.account_holder), account_number: text(r.account_number),
        ifsc: text(r.ifsc), bank_name: text(r.bank_name), branch: text(r.branch), is_primary: true }] : [],
      material_ids: materialIds,
    }));
    const key = norm(r.name);
    if (key) {
      if (seen.has(key)) errors.push(`Same vendor name as row ${seen.get(key)}`);
      else seen.set(key, r.row_no);
      const ex = lk.venNames.get(key);
      if (ex) errors.push(`A vendor named "${ex.name}" already exists (${ex.code})`);
    }
    return { row_no: r.row_no, values: { ...r, account_number: r.account_number ? `XXXX${String(r.account_number).slice(-4)}` : r.account_number }, data, errors, action: 'create' };
  });
}

function validateVendorUpdate(rows, lk) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = [];
    const code = text(r.code)?.toUpperCase();
    const ex = code ? lk.venByCode.get(code) : null;
    if (!code) errors.push('Vendor Code is required');
    else if (!ex) errors.push(`Vendor ${code} not found`);
    else if (seen.has(code)) errors.push(`Vendor ${code} is repeated (row ${seen.get(code)})`);
    if (code) seen.set(code, r.row_no);
    if (!ex) return { row_no: r.row_no, values: r, errors, changes: [], action: 'update' };
    const patch = {};
    const changes = [];
    const fields = [['name', 'Name'], ['phone', 'Phone'], ['contact_email', 'Email'], ['gstin', 'GSTIN'], ['fssai_no', 'FSSAI No']];
    for (const [f, label] of fields) {
      if (!blank(r[f]) && !same(r[f], ex[f])) { patch[f] = text(r[f]); changes.push({ field: label, from: ex[f], to: text(r[f]) }); }
    }
    if (!blank(r.fssai_expiry)) {
      const d = toDate(r.fssai_expiry);
      const old = ex.fssai_expiry ? String(ex.fssai_expiry).slice(0, 10) : null;
      if (d === undefined) errors.push('FSSAI expiry must be a date (YYYY-MM-DD)');
      else if (d !== old) { patch.fssai_expiry = d; changes.push({ field: 'FSSAI Expiry', from: old, to: d }); }
    }
    if (!blank(r.status)) {
      const s = fromLabel(STATUS_LABEL, r.status);
      if (s === undefined) errors.push('Status must be Active or Inactive');
      else if (s !== ex.status) { patch.status = s; changes.push({ field: 'Status', from: STATUS_LABEL[ex.status], to: STATUS_LABEL[s] }); }
    }
    capture(errors, () => md.parseVendorBasic(patch, { partial: true }));
    return { row_no: r.row_no, values: r, id: ex.id, code: ex.code, patch, changes, errors, action: changes.length ? 'update' : 'unchanged' };
  });
}

// ============================================================================
// MPNs
// ============================================================================
function validateMpnCreate(rows, lk) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = [];
    const mat = r.material_id ? lk.matById.get(r.material_id) : lk.matByCode.get(String(text(r.material_code) || '').toUpperCase());
    const ven = r.vendor_id ? lk.venById.get(r.vendor_id) : lk.venByCode.get(String(text(r.vendor_code) || '').toUpperCase());
    if (!mat) errors.push(blank(r.material_code) && !r.material_id ? 'Material is required' : `Material ${r.material_code || ''} not found`);
    else if (mat.status !== 'ACTIVE') errors.push(`Material ${mat.code} is inactive`);
    if (!ven) errors.push(blank(r.vendor_code) && !r.vendor_id ? 'Vendor is required' : `Vendor ${r.vendor_code || ''} not found`);
    else if (ven.status !== 'ACTIVE') errors.push(`Vendor ${ven.code} is inactive`);
    const moq = toNum(r.moq);
    const price = toNum(r.price);
    const lead = toNum(r.lead_time_days);
    if (blank(r.uom) && !mat) errors.push('UOM is required');
    const uom = blank(r.uom) ? null : matchUom(lk.uoms, r.uom, 'UOM', { errors });
    if (moq === null) errors.push('MOQ is required');
    else if (moq === undefined || moq <= 0) errors.push('MOQ must be a number greater than 0');
    if (price === null) errors.push('Price is required');
    else if (price === undefined || price < 0) errors.push('Price must be a number, 0 or more');
    if (lead === undefined || (lead !== null && lead < 0)) errors.push('Lead time must be 0 or more days');
    if (mat && ven) {
      const k = `${mat.id}|${ven.id}`;
      if (seen.has(k)) errors.push(`Same material and vendor as row ${seen.get(k)}`);
      else seen.set(k, r.row_no);
      const ex = lk.mpnRows.find((m) => m.material_id === mat.id && m.vendor_id === ven.id);
      if (ex) errors.push(`${ven.code} already supplies ${mat.code} as ${ex.mpn_code}; use Bulk Update to change its price`);
    }
    return {
      row_no: r.row_no,
      values: { ...r, material_code: mat?.code || r.material_code, material_name: mat?.name, vendor_code: ven?.code || r.vendor_code, vendor_name: ven?.name },
      data: mat && ven ? {
        materialId: mat.id, vendorId: ven.id, uom: uom || mat.uom, moq, price, lead,
        manufacturer: text(r.manufacturer),
      } : null,
      errors,
      action: 'create',
    };
  });
}

function validateMpnUpdate(rows, lk) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = [];
    const mpnCode = String(text(r.mpn_code) || '').toUpperCase();
    const venCode = String(text(r.vendor_code) || '').toUpperCase();
    const ven = lk.venByCode.get(venCode);
    const matches = lk.mpnRows.filter((m) => String(m.mpn_code).toUpperCase() === mpnCode);
    if (!mpnCode) errors.push('MPN Code is required');
    else if (!matches.length) errors.push(`MPN ${mpnCode} not found`);
    if (!venCode) errors.push('Vendor Code is required');
    else if (!ven) errors.push(`Vendor ${venCode} not found`);
    const ex = ven ? matches.find((m) => m.vendor_id === ven.id) : null;
    if (matches.length && ven && !ex) errors.push(`${venCode} is not linked to ${mpnCode}`);
    const k = `${mpnCode}|${venCode}`;
    if (seen.has(k)) errors.push(`Repeated (row ${seen.get(k)})`);
    seen.set(k, r.row_no);
    if (!ex) return { row_no: r.row_no, values: r, errors, changes: [], action: 'update' };

    const patch = {};
    const changes = [];
    if (!blank(r.uom) && !same(r.uom, ex.uom)) {
      const u = matchUom(lk.uoms, r.uom, 'UOM', { errors, current: ex.uom });
      if (u && u !== ex.uom) { patch.uom = u; changes.push({ field: 'UOM', from: ex.uom, to: u }); }
    }
    for (const [f, label, min, gt] of [['moq', 'MOQ', 0, true], ['price', 'Price', 0, false], ['lead_time_days', 'Lead time', 0, false]]) {
      if (blank(r[f])) continue;
      const n = toNum(r[f]);
      if (n === undefined || (gt ? n <= min : n < min)) errors.push(`${label} must be ${gt ? 'greater than' : 'at least'} ${min}`);
      else if (!same(n, ex[f])) { patch[f] = n; changes.push({ field: label, from: ex[f], to: n }); }
    }
    if (!blank(r.is_preferred)) {
      const p = yesNo(r.is_preferred);
      if (p === undefined) errors.push('Preferred must be Yes or No');
      else if (p !== ex.is_preferred) { patch.is_preferred = p; changes.push({ field: 'Preferred', from: ex.is_preferred ? 'Yes' : 'No', to: p ? 'Yes' : 'No' }); }
    }
    if (!blank(r.manufacturer) && !same(r.manufacturer, ex.manufacturer)) {
      patch.manufacturer = text(r.manufacturer); changes.push({ field: 'Manufacturer', from: ex.manufacturer, to: patch.manufacturer });
    }
    if (!blank(r.status)) {
      const s = fromLabel(STATUS_LABEL, r.status);
      if (s === undefined) errors.push('MPN Status must be Active or Inactive');
      else if (s !== ex.status) { patch.status = s; changes.push({ field: 'MPN Status', from: STATUS_LABEL[ex.status], to: STATUS_LABEL[s] }); }
    }
    return { row_no: r.row_no, values: r, mv_id: ex.mv_id, mpn_id: ex.mpn_id, code: ex.mpn_code, patch, changes, errors,
      action: changes.length ? 'update' : 'unchanged' };
  });
}

// ============================================================================
// Validate / commit dispatch
// ============================================================================
function prepRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('No rows to process');
  if (rows.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows per upload`);
  return rows.map((r, i) => ({ ...r, row_no: r.row_no || i + 1 }));
}

const VALIDATORS = {
  materials: { create: validateMaterialCreate, update: validateMaterialUpdate },
  vendors: { create: validateVendorCreate, update: validateVendorUpdate },
  mpns: { create: validateMpnCreate, update: validateMpnUpdate },
};

async function validate(entity, mode, rows, db = { query }) {
  const fn = VALIDATORS[entity]?.[mode];
  if (!fn) throw badRequest('Unknown bulk operation');
  const lk = await loadLookups(db);
  const checked = fn(prepRows(rows), lk);
  // Mark in-file conflicts on preferred vendor for MPN updates is handled by the DB (one preferred per MPN).
  return checked;
}

function summary(checked) {
  return {
    total: checked.length,
    errors: checked.filter((r) => r.errors.length).length,
    create: checked.filter((r) => !r.errors.length && r.action === 'create').length,
    update: checked.filter((r) => !r.errors.length && r.action === 'update').length,
    unchanged: checked.filter((r) => !r.errors.length && r.action === 'unchanged').length,
  };
}

async function commitMpnRows(c, checked, userId) {
  await md.actAs(c, userId);
  const out = [];
  for (const r of checked) {
    const d = r.data;
    const mpn = await md.createMpn(c, {
      materialId: d.materialId, manufacturer: d.manufacturer,
      vendors: [{ vendorId: d.vendorId, preferred: true, lead: d.lead, uom: d.uom, moq: d.moq, price: d.price }],
    }, userId);
    out.push({ row_no: r.row_no, code: mpn.mpn_code, id: mpn.id });
  }
  return out;
}

async function commit(c, entity, mode, checked, userId) {
  await md.actAs(c, userId);
  const out = [];
  if (entity === 'materials' && mode === 'create') {
    for (const r of checked) out.push({ row_no: r.row_no, code: (await md.createMaterial(c, r.data, userId)).code });
  } else if (entity === 'materials') {
    for (const r of checked.filter((x) => x.action === 'update')) {
      await md.updateMaterial(c, r.id, { ...r.patch }, userId);
      out.push({ row_no: r.row_no, code: r.code });
    }
  } else if (entity === 'vendors' && mode === 'create') {
    for (const r of checked) out.push({ row_no: r.row_no, code: (await md.createVendor(c, r.data, userId)).code });
  } else if (entity === 'vendors') {
    for (const r of checked.filter((x) => x.action === 'update')) {
      await md.updateVendor(c, r.id, { basic: r.patch }, userId);
      out.push({ row_no: r.row_no, code: r.code });
    }
  } else if (entity === 'mpns' && mode === 'create') {
    return commitMpnRows(c, checked, userId);
  } else if (entity === 'mpns') {
    for (const r of checked.filter((x) => x.action === 'update')) {
      const p = r.patch;
      if (p.is_preferred === true) {
        await c.query('update public.mpn_vendors set is_preferred = false where mpn_id = $1 and id <> $2', [r.mpn_id, r.mv_id]);
      }
      const mvCols = ['uom', 'moq', 'price', 'lead_time_days', 'is_preferred'].filter((k) => k in p);
      if (mvCols.length) {
        await c.query(`update public.mpn_vendors set ${mvCols.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
          [r.mv_id, ...mvCols.map((k) => p[k])]);
      }
      if ('manufacturer' in p || 'status' in p) {
        await c.query(`update public.mpns set manufacturer = case when $2 then $3 else manufacturer end,
                              status = coalesce($4, status), updated_by = $5 where id = $1`,
        [r.mpn_id, 'manufacturer' in p, p.manufacturer ?? null, p.status ?? null, userId]);
      }
      out.push({ row_no: r.row_no, code: r.code });
    }
  }
  return out;
}

// ============================================================================
// Files: template / export / parse
// ============================================================================
async function exportRows(entity, db = { query }, { forUpdate = false } = {}) {
  if (entity === 'materials') {
    const { rows } = await db.query(`
      select m.code, m.name, m.classification, c.name as category, sc.name as sub_category, m.uom, m.shelf_life_days,
             m.status, m.description
        from public.materials m
        left join public.material_categories c on c.id = m.category_id
        left join public.material_categories sc on sc.id = m.sub_category_id order by m.code`);
    return rows.map((r) => ({ ...r, classification: CLASS_LABEL[r.classification], status: STATUS_LABEL[r.status] }));
  }
  if (entity === 'vendors') {
    const { rows } = await db.query(`
      select v.code, v.name, v.status, v.phone, v.contact_email, v.gstin, v.fssai_no, to_char(v.fssai_expiry, 'YYYY-MM-DD') as fssai_expiry
        from public.vendors v order by v.code`);
    return rows.map((r) => ({ ...r, status: STATUS_LABEL[r.status] }));
  }
  if (entity === 'mpns') {
    const { rows } = await db.query(`
      select p.mpn_code, ve.code as vendor_code, m.code as material_code, m.name as material_name, mv.uom, mv.moq, mv.price,
             mv.lead_time_days, mv.is_preferred, p.manufacturer, p.status
        from public.mpns p join public.materials m on m.id = p.material_id
        left join public.mpn_vendors mv on mv.mpn_id = p.id left join public.vendors ve on ve.id = mv.vendor_id
       ${forUpdate ? 'where mv.id is not null' : ''}
       order by p.mpn_code, ve.code`);
    return rows.map((r) => ({ ...r, is_preferred: r.vendor_code ? (r.is_preferred ? 'Yes' : 'No') : null, status: STATUS_LABEL[r.status] }));
  }
  throw badRequest('Unknown entity');
}

const TITLES = { materials: 'Materials', vendors: 'Vendors', mpns: 'MPNs' };

async function buildWorkbook(entity, mode, rows, db = { query }) {
  const cols = columns(entity, mode);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP';
  const ws = wb.addWorksheet(TITLES[entity]);
  ws.columns = cols.map((c) => ({ header: c.header + (c.required ? ' *' : ''), key: c.key, width: c.width || 14 }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  head.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow(r);
  const last = Math.max(rows.length + 200, 500);
  const L = await buildLists(db);
  const clsCol = cols.findIndex((c) => c.key === 'classification') + 1;
  const catCol = cols.findIndex((c) => c.key === 'category') + 1;
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.textCell) col.numFmt = '@';
    if (c.readOnly) col.font = { color: { argb: 'FF6B7280' } };
    if (!c.list && !c.dyn) return;
    for (let n = 2; n <= last; n += 1) {
      let formula = c.list ? `"${c.list.join(',')}"` : null;
      let strict = true;
      if (c.dyn === 'uom') formula = L.uom;
      if (c.dyn === 'state') { formula = L.state; strict = false; }
      if (c.dyn === 'category') { formula = clsCol ? L.categoryFor(`$${colLetter(clsCol)}${n}`) : L.allCategories; strict = false; }
      if (c.dyn === 'subcategory') { formula = catCol ? L.subFor(`$${colLetter(catCol)}${n}`) : null; strict = false; }
      if (!formula) continue;
      ws.getCell(n, i + 1).dataValidation = {
        type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: strict ? 'stop' : 'warning',
        errorTitle: c.header, error: `Pick ${c.header} from the list${strict ? '' : ' (the upload check will confirm it)'}`,
      };
    }
  });

  // Help sheet with rules and, for materials, the category list.
  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 28 }, { width: 90 }];
  const lines = [
    ['How to use', mode === 'update'
      ? 'Change the cells you want to update. Leave a cell blank to keep its current value. Do not change the code columns.'
      : 'Fill one row per record. Columns marked * are required. Codes are assigned automatically - there is no code column.'],
    ['Saving', 'Upload the file, check the preview, then Save. If any row has an error, nothing is saved.'],
    ['Dropdowns', 'Click a cell to pick from its list. Category shows only the categories of the Classification in the same row; Sub-category only those of the Category.'],
  ];
  if (entity === 'materials') lines.push(['Classification', Object.values(CLASS_LABEL).join(', ')]);
  if (entity !== 'vendors') lines.push(['UOM', L.uomCodes.join(', ')]);
  if (entity === 'vendors' && mode === 'create') lines.push(['Addresses / contacts / bank', 'One of each per row. Add more later from the vendor form.']);
  if (entity === 'mpns' && mode === 'create') lines.push(['MPN code', 'Assigned automatically (MPN1001, MPN1002, ...). One MPN is created per row.']);
  lines.forEach((l) => help.addRow(l));
  help.getColumn(1).font = { bold: true };
  if (entity === 'materials') {
    const ref = wb.addWorksheet('Categories');
    ref.columns = [{ header: 'Classification', width: 18 }, { header: 'Category', width: 26 }, { header: 'Sub-categories', width: 70 }];
    ref.getRow(1).font = { bold: true };
    for (const c of L.tops) {
      ref.addRow([c.classification ? CLASS_LABEL[c.classification] : 'Any', c.name, L.subsOf(c.id).join(', ')]);
    }
  }
  // Hidden sheet that feeds the dropdowns (kept last; the data sheet stays first for upload).
  L.write(wb.addWorksheet('Lists', { state: 'hidden' }));
  return wb;
}

function colLetter(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Hidden "Lists" sheet feeding the dropdowns.
 *   A: UOM codes · B: states · C: all active categories
 *   From E: one column per classification (row 1 label, row 2 count, rows 3+ its categories)
 *   Then: one column per category (row 1 name, row 2 count, rows 3+ its sub-categories)
 * Dependent dropdowns use MATCH on row 1 and OFFSET down the matching column.
 */
async function buildLists(db) {
  const [catRows, uoms] = await Promise.all([
    db.query(`select id, name, parent_id, classification from public.material_categories where status = 'ACTIVE' order by lower(name)`),
    loadUoms(db),
  ]);
  const uomCodes = uoms.list.filter((u) => u.status === 'ACTIVE').map((u) => u.code);
  const tops = catRows.rows.filter((c) => !c.parent_id)
    .sort((a, b) => (a.classification || 'ZZ').localeCompare(b.classification || 'ZZ') || a.name.localeCompare(b.name));
  const subsOf = (id) => catRows.rows.filter((c) => c.parent_id === id).map((c) => c.name);
  const clsCols = Object.entries(CLASS_LABEL).map(([k, label]) => ({
    header: label, values: tops.filter((c) => !c.classification || c.classification === k).map((c) => c.name),
  }));
  const subCols = tops.map((c) => ({ header: c.name, values: subsOf(c.id) }));
  const firstCls = 5;
  const firstSub = firstCls + clsCols.length;
  const lastSub = Math.max(firstSub, firstSub + subCols.length - 1);
  const rng = (a, b, r1, r2) => `Lists!$${colLetter(a)}$${r1}:$${colLetter(b)}$${r2}`;
  const colRange = (c, n) => (n ? `Lists!$${colLetter(c)}$3:$${colLetter(c)}$${n + 2}` : 'Lists!$D$1');
  const dependent = (cell, from, to) => {
    const m = `MATCH(${cell},${rng(from, to, 1, 1)},0)`;
    return `IF(ISNA(${m}),Lists!$D$1,OFFSET(Lists!$${colLetter(from)}$3,0,${m}-1,MAX(1,INDEX(${rng(from, to, 2, 2)},${m})),1))`;
  };
  return {
    tops, subsOf, uomCodes,
    uom: colRange(1, uomCodes.length),
    state: colRange(2, STATES.length),
    allCategories: colRange(3, tops.length),
    categoryFor: (cell) => dependent(cell, firstCls, firstCls + clsCols.length - 1),
    subFor: (cell) => (subCols.length ? dependent(cell, firstSub, lastSub) : null),
    write(ws) {
      const put = (c, header, values) => {
        if (header !== null) { ws.getCell(1, c).value = header; ws.getCell(2, c).value = values.length; }
        values.forEach((val, i) => { ws.getCell(i + 3, c).value = val; });
      };
      put(1, 'UOM', uomCodes);
      put(2, 'State', STATES);
      put(3, 'Category', tops.map((c) => c.name));
      clsCols.forEach((x, i) => put(firstCls + i, x.header, x.values));
      subCols.forEach((x, i) => put(firstSub + i, x.header, x.values));
    },
  };
}

async function templateBuffer(entity, mode) {
  const rows = mode === 'update' ? await exportRows(entity, undefined, { forUpdate: true }) : [];
  const wb = await buildWorkbook(entity, mode, rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvEscape(x) {
  if (x === null || x === undefined) return '';
  const s = String(x);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportFile(entity, format) {
  const rows = await exportRows(entity);
  if (format === 'csv') {
    const cols = columns(entity, 'update');
    const out = [cols.map((c) => csvEscape(c.header)).join(',')];
    for (const r of rows) out.push(cols.map((c) => csvEscape(r[c.key])).join(','));
    return { buffer: Buffer.from(`﻿${out.join('\r\n')}`, 'utf8'), type: 'text/csv; charset=utf-8', ext: 'csv' };
  }
  const wb = await buildWorkbook(entity, 'update', rows);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

function parseCsv(textIn) {
  const s = textIn.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return v.text;
    if (v.result !== undefined) return v.result;
    return null;
  }
  return v;
}

/** Turn an uploaded xlsx/csv into row objects keyed by column key. */
async function parseFile(entity, mode, filename, base64) {
  if (!base64) throw badRequest('Choose a file to upload');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > 5 * 1024 * 1024) throw badRequest('File is larger than 5 MB');
  const cols = columns(entity, mode);
  const byHeader = new Map(cols.map((c) => [norm(c.header), c.key]));
  let grid = [];
  if (/\.csv$/i.test(filename || '')) {
    grid = parseCsv(buf.toString('utf8'));
  } else {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf); } catch { throw badRequest('Could not read the file. Upload the .xlsx template or a .csv file.'); }
    const ws = wb.worksheets[0];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals = [];
      for (let i = 1; i <= Math.max(row.cellCount, cols.length); i += 1) vals.push(cellValue(row.getCell(i).value));
      grid[n - 1] = vals;
    });
    grid = Array.from(grid, (r) => r || []);
  }
  if (!grid.length) throw badRequest('The file is empty');
  const keys = grid[0].map((h) => byHeader.get(norm(String(h ?? '').replace(/\*/g, ''))) || null);
  const missing = cols.filter((c) => c.required && !keys.includes(c.key)).map((c) => c.header);
  if (missing.length) {
    throw badRequest(`This does not look like the ${mode === 'update' ? 'Bulk Update' : 'Bulk Entry'} template. Missing column(s): ${missing.join(', ')}`);
  }
  const rows = [];
  for (let i = 1; i < grid.length; i += 1) {
    const r = { row_no: i + 1 };
    let any = false;
    keys.forEach((k, j) => {
      if (!k) return;
      const val = grid[i][j];
      if (!blank(val)) any = true;
      r[k] = typeof val === 'string' ? val.trim() : val;
    });
    if (any) rows.push(r);
  }
  if (!rows.length) throw badRequest('No data rows found under the header');
  if (rows.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows per upload`);
  return rows;
}

/** For the MPN grid endpoint (ids from dropdowns). */
async function validateMpnRows(rows) {
  return validate('mpns', 'create', rows);
}

module.exports = {
  columns, validate, summary, commit, templateBuffer, exportFile, parseFile, validateMpnRows, commitMpnRows,
  CLASS_LABEL, STATUS_LABEL,
};
