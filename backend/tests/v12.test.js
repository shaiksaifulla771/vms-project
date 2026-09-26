const { resetDb, ctx, api, close } = require('./helpers');

let admin;
let editor;

beforeAll(async () => {
  await resetDb();
  const C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
});
afterAll(close);

describe('v12: vendor contact notes', () => {
  test('notes are saved, read back and editable; contacts without notes still work', async () => {
    const created = await editor.post('/vendors', { name: 'Notes Vendor', contacts: [
      { name: 'Ravi', phone: '9820011111', notes: 'Handles invoices.\nCall before 11am.' },
      { name: 'Meena', designation: 'Dispatch' },
    ] });
    expect(created.status).toBe(201);
    let v = (await admin.get(`/vendors/${created.body.id}`)).body;
    expect(v.contacts.map((c) => [c.name, c.notes])).toEqual([['Ravi', 'Handles invoices.\nCall before 11am.'], ['Meena', null]]);

    const upd = await editor.put(`/vendors/${v.id}`, { contacts: [{ name: 'Ravi', notes: 'Now handles dispatch too' }] });
    expect(upd.status).toBe(200);
    v = (await admin.get(`/vendors/${v.id}`)).body;
    expect(v.contacts).toHaveLength(1);
    expect(v.contacts[0].notes).toBe('Now handles dispatch too');
  });

  test('notes are validated: too long or not text is refused, nothing is half-saved', async () => {
    const v = (await editor.post('/vendors', { name: 'Notes Limit', contacts: [{ name: 'Asha', notes: 'ok' }] })).body;
    const long = await editor.put(`/vendors/${v.id}`, { contacts: [{ name: 'Asha', notes: 'x'.repeat(1001) }] });
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/notes/i);
    const obj = await editor.put(`/vendors/${v.id}`, { contacts: [{ name: 'Asha', notes: { a: 1 } }] });
    expect(obj.status).toBe(400);
    const after = (await admin.get(`/vendors/${v.id}`)).body;
    expect(after.contacts[0].notes).toBe('ok');
  });
});
