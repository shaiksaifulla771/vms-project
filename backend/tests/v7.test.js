const ExcelJS = require('exceljs');
const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let viewer;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  viewer = api(C.viewer.id);
});
afterAll(close);

async function parse(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Material Name *', 'Classification *', 'Category', 'Sub-category', 'UOM *', 'Shelf Life (days)', 'Status', 'Description']);
  rows.forEach((r) => ws.addRow(r));
  const data = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  return (await admin.post('/bulk/materials/parse?mode=create', { filename: 'm.xlsx', data })).body.rows;
}

describe('v7: create missing categories from Bulk Entry', () => {
  let rows;
  test('preview lists the missing categories and marks rows that only need them', async () => {
    rows = await parse([
      ['Q Ragi', 'Raw Material', 'Grains', 'Ragi', 'kg', '', '', ''],
      ['Q Wheat', 'Raw Material', 'grains', 'Wheat', 'kg', '', '', ''],
      ['Q Jute Bag', 'Packaging', 'Primary Packaging', 'Jute Bags', 'pcs', '', '', ''],
      ['Q Bad', 'Raw Material', 'Grains', '', 'bucket', '', '', ''],
      ['Q Wrong Class', 'Packaging', 'Grains & Pulses', '', 'pcs', '', '', ''],
    ]);
    const prev = (await admin.post('/bulk/materials/preview', { mode: 'create', rows })).body;
    expect(prev.summary).toMatchObject({ total: 5, errors: 5, needs_category: 3 });
    expect(prev.rows.map((r) => Boolean(r.needs_only))).toEqual([true, true, true, false, false]);
    const grains = prev.missing_categories.find((m) => m.category === 'Grains');
    expect(grains).toMatchObject({ classification: 'RAW_MATERIAL', category_exists: false, sub_categories: ['Ragi', 'Wheat'] });
    expect(grains.similar).toContain('Grains & Pulses');
    const pk = prev.missing_categories.find((m) => m.category === 'Primary Packaging');
    expect(pk).toMatchObject({ classification: 'PACKAGING', category_exists: true, sub_categories: ['Jute Bags'] });
    expect(prev.missing_categories.some((m) => m.category === 'Grains & Pulses')).toBe(false); // wrong class stays an error
  });

  test('one call creates them (viewers cannot); the rows are then ready', async () => {
    const prev = (await admin.post('/bulk/materials/preview', { mode: 'create', rows })).body;
    const items = prev.missing_categories.map(({ classification, category, sub_categories }) => ({ classification, category, sub_categories }));
    expect((await viewer.post('/categories/bulk-create', { items })).status).toBe(403);
    const r = await admin.post('/categories/bulk-create', { items });
    expect(r.status).toBe(201);
    expect(r.body.categories.map((x) => x.name)).toEqual(['Grains']);
    expect(r.body.sub_categories.map((x) => x.name).sort()).toEqual(['Jute Bags', 'Ragi', 'Wheat']);
    const again = (await admin.post('/bulk/materials/preview', { mode: 'create', rows })).body;
    expect(again.summary).toMatchObject({ create: 3, needs_category: 0, errors: 2 });
    expect(again.missing_categories).toEqual([]);
    const commit = await admin.post('/bulk/materials/commit', { mode: 'create', rows: rows.slice(0, 3) });
    expect(commit.status).toBe(201);
    const m = (await q(`select c.name cat, s.name sub from public.materials m join public.material_categories c on c.id = m.category_id
                        join public.material_categories s on s.id = m.sub_category_id where m.name = 'Q Wheat'`))[0];
    expect(m).toEqual({ cat: 'Grains', sub: 'Wheat' });
  });

  test('bulk-create reuses existing names and refuses a name owned by another classification', async () => {
    const r = await admin.post('/categories/bulk-create', { items: [{ classification: 'RAW_MATERIAL', category: 'GRAINS', sub_categories: ['ragi', 'Barley'] }] });
    expect(r.status).toBe(201);
    expect(r.body.categories).toEqual([]);
    expect(r.body.sub_categories.map((x) => x.name)).toEqual(['Barley']);
    const bad = await admin.post('/categories/bulk-create', { items: [{ classification: 'PACKAGING', category: 'Grains' }] });
    expect(bad.status).toBe(400);
  });

  test('bulk update also reports missing sub-categories', async () => {
    const code = (await q(`select code from public.materials where name = 'Q Ragi'`))[0].code;
    const prev = (await admin.post('/bulk/materials/preview', { mode: 'update', rows: [{ row_no: 2, code, sub_category: 'Finger Millet' }] })).body;
    expect(prev.summary.needs_category).toBe(1);
    expect(prev.missing_categories).toEqual([expect.objectContaining({ category: 'Grains', sub_categories: ['Finger Millet'], category_exists: true })]);
  });
});

describe('v7: same new category name under two classifications', () => {
  test('first row wins; the other row gets an error and is not offered for creation', async () => {
    const rows = await parse([
      ['Z Film', 'Packaging', 'Wraps', 'Film', 'pcs', '', '', ''],
      ['Z Tape', 'Consumable', 'wraps', 'Tape', 'roll', '', '', ''],
    ]);
    const prev = (await admin.post('/bulk/materials/preview', { mode: 'create', rows })).body;
    expect(prev.missing_categories).toEqual([expect.objectContaining({ classification: 'PACKAGING', category: 'Wraps', sub_categories: ['Film'] })]);
    expect(prev.rows[1].needs_only).toBe(false);
    expect(prev.rows[1].errors.join(' ')).toMatch(/already being created for Packaging \(row 2\)/);
    expect(prev.summary.needs_category).toBe(1);
  });
});
