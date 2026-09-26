import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate } from '../../lib/format';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';
import { Link } from 'react-router-dom';
import { UomSelect, categoriesFor, useCategories, useUoms } from '../../components/pickers';
import { BulkDialog, DeleteDialog, FunctionsMenu, actionsColumn } from '../../components/masterKit';
import { usePersistedState } from '../../lib/usePersisted';

const CLASSES = Object.entries(CLASS_LABEL);

const NEW = '__new__';

/** "+ Add new" box under a Category / Sub-category dropdown. */
function QuickAdd({ label, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => { if (!name.trim()) return; setBusy(true); await onAdd(name.trim()); setBusy(false); };
  return (
    <span className="mt-1 flex gap-1">
      <input className="input" autoFocus placeholder={label} value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') onCancel(); }} />
      <button type="button" className="btn-primary px-2" disabled={busy || !name.trim()} onClick={add}>Add</button>
      <button type="button" className="btn-secondary px-2" onClick={onCancel}>Cancel</button>
    </span>
  );
}

export function MaterialForm({ material, onClose, onDone, preset }) {
  const [catKey, setCatKey] = useState(0);
  const cats = useCategories(catKey);
  const [adding, setAdding] = useState(null); // 'cat' | 'sub' | null
  const uoms = useUoms();
  const { canWrite } = useApp();
  const isNew = !material;
  const [f, setF] = useState(material
    ? { ...material, shelf_life_days: material.shelf_life_days ?? '', reorder_level: material.reorder_level ?? '', category_id: material.category_id || '',
      sub_category_id: material.sub_category_id || '', description: material.description || '' }
    : { name: '', classification: 'RAW_MATERIAL', uom: 'kg', shelf_life_days: '', reorder_level: '', status: 'ACTIVE', category_id: '',
      sub_category_id: '', description: '', ...preset });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const subs = cats.find((c) => c.id === f.category_id)?.children || [];
  const catChoices = categoriesFor(cats, f.classification, f.category_id);
  // A new classification keeps the category only if it belongs to that classification (or to none).
  const setClass = (cls) => {
    const cat = cats.find((c) => c.id === f.category_id);
    const keep = cat && (!cat.classification || cat.classification === cls);
    setF({ ...f, classification: cls, category_id: keep ? f.category_id : '', sub_category_id: keep ? f.sub_category_id : '' });
  };

  // Create a category (under the chosen classification) or a sub-category (under the chosen category) and select it.
  const quickAdd = async (name) => {
    setErr(null);
    try {
      const cat = cats.find((c) => c.id === f.category_id);
      const item = adding === 'cat'
        ? { classification: f.classification, category: name }
        : { classification: cat?.classification || f.classification, category: cat?.name, sub_categories: [name] };
      await api.post('/categories/bulk-create', { items: [item] }, { scoped: false });
      const tree = await api.get('/categories', { scoped: false });
      const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
      if (adding === 'cat') {
        const c = tree.find((x) => same(x.name, name));
        setF((x) => ({ ...x, category_id: c?.id || '', sub_category_id: '' }));
      } else {
        const sc = tree.find((x) => x.id === f.category_id)?.children.find((x) => same(x.name, name));
        setF((x) => ({ ...x, sub_category_id: sc?.id || '' }));
      }
      setAdding(null);
      setCatKey((k) => k + 1);
    } catch (e) { setErr(e.message); }
  };

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const body = {
        name: f.name, classification: f.classification, uom: f.uom, status: f.status,
        shelf_life_days: f.shelf_life_days === '' ? null : Number(f.shelf_life_days),
        reorder_level: f.reorder_level === '' ? null : Number(f.reorder_level),
        category_id: f.category_id || null, sub_category_id: f.sub_category_id || null, description: f.description || null,
      };
      const saved = isNew
        ? await api.post('/materials', body)
        : await api.put(`/materials/${material.id}`, body);
      onDone(saved);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'New Material' : `Edit ${material.code}`} onClose={onClose} width="max-w-3xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <ErrorBox message={err} onClose={() => setErr(null)} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Material Code" hint={isNew ? 'Assigned automatically on save (M1001, M1002, ...)' : 'Cannot be changed'}>
          <input className="input" value={isNew ? 'Auto' : material.code} disabled />
        </Field>
        <Field label="Material Name" required className="col-span-2"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Classification" required>
          <select className="input" value={f.classification} onChange={(e) => setClass(e.target.value)}>
            {CLASSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Category" hint={catChoices.length ? `${CLASS_LABEL[f.classification]} categories` : <>No {CLASS_LABEL[f.classification]} categories yet{canWrite && <> · <Link className="text-accent" to="/settings/categories">add one</Link></>}</>}>
          <select className="input" value={f.category_id}
            onChange={(e) => (e.target.value === NEW ? setAdding('cat') : setF({ ...f, category_id: e.target.value, sub_category_id: '' }))}>
            <option value="">-</option>
            {catChoices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}
            {canWrite && <option value={NEW}>+ Add new category…</option>}
          </select>
          {adding === 'cat' && <QuickAdd label={`New ${CLASS_LABEL[f.classification]} category`} onAdd={quickAdd} onCancel={() => setAdding(null)} />}
        </Field>
        <Field label="Sub-category" hint={f.category_id && !subs.length && adding !== 'sub' ? 'No sub-categories under this category yet' : ''}>
          <select className="input" value={f.sub_category_id} disabled={!f.category_id}
            onChange={(e) => (e.target.value === NEW ? setAdding('sub') : setF({ ...f, sub_category_id: e.target.value }))}>
            <option value="">-</option>
            {subs.filter((s) => s.status === 'ACTIVE' || s.id === f.sub_category_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {canWrite && f.category_id && <option value={NEW}>+ Add new sub-category…</option>}
          </select>
          {adding === 'sub' && <QuickAdd label="New sub-category" onAdd={quickAdd} onCancel={() => setAdding(null)} />}
        </Field>
        <Field label="Base UOM" required hint="Inventory is kept in this unit">
          <UomSelect value={f.uom} uoms={uoms} onChange={(u) => setF({ ...f, uom: u })} placeholder="Select UOM" />
        </Field>
        <Field label="Shelf Life (days)" hint="Suggests expiry dates"><input className="input num" type="number" min="1" value={f.shelf_life_days} onChange={set('shelf_life_days')} /></Field>
        <Field label={`Reorder Level${f.uom ? ` (${f.uom})` : ''}`} hint="Alert when free stock falls to this level"><input className="input num" type="number" min="0" step="any" value={f.reorder_level} onChange={set('reorder_level')} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </Field>
        <Field label="Description" className="col-span-3">
          <textarea className="input h-16 py-1.5" value={f.description} onChange={set('description')} maxLength={2000} />
        </Field>
      </div>
      {isNew && (
        <p className="border-t border-line pt-3 text-xs2 text-ink-muted">
          {f.classification !== 'FINISHED_GOOD' && <>Vendors and prices are added in <b>MPNs</b> (material + vendor + UOM + MOQ + price) after saving.</>}
          {f.classification === 'FINISHED_GOOD' && ' Finished goods are made in-house: they have no MPN and cannot be purchased.'}
        </p>
      )}
    </Modal>
  );
}

export default function MaterialsPage() {
  const { canWrite, notify } = useApp();
  const navigate = useNavigate();
  const cats = useCategories();
  const [cls, setCls] = usePersistedState('materials.cls', '');
  const [cat, setCat] = usePersistedState('materials.cat', '');
  const [status, setStatus] = usePersistedState('materials.status', '');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(
    () => api.get(`/materials${qs({ classification: cls, category_id: cat, status })}`, { scoped: false }), [cls, cat, status]);
  const close = () => setModal(null);
  const done = (msg) => () => { setModal(null); if (msg) notify(msg); reload(); };

  const columns = [
    { key: 'code', label: 'Material Code' },
    { key: 'name', label: 'Material Name', className: 'whitespace-normal min-w-[200px]' },
    { key: 'classification', label: 'Classification', value: (r) => CLASS_LABEL[r.classification], printFilter: true },
    { key: 'category_name', label: 'Category', printFilter: true },
    { key: 'sub_category_name', label: 'Sub-category' },
    { key: 'mpns', label: 'MPN(s)', value: (r) => (r.classification === 'FINISHED_GOOD' ? 'Made in-house' : r.mpns.map((m) => m.mpn_code).join(', ')), className: 'whitespace-normal max-w-[220px]' },
    { key: 'uom', label: 'UOM' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status, printFilter: true },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
    actionsColumn({
      canWrite,
      onView: (r) => navigate(`/masters/materials/${r.id}`),
      onEdit: (r) => navigate(`/masters/materials/${r.id}/edit`),
      onDelete: (r) => setModal({ type: 'delete', row: r }),
    }),
  ];

  return (
    <div>
      <PageHeader title="Material Master" subtitle="Raw materials, packaging and finished goods · codes are assigned automatically"
        actions={<>
          <FunctionsMenu entity="materials" onManual={() => navigate('/masters/materials/new')} onBulk={(mode) => setModal({ type: 'bulk', mode })} />
          {canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/materials/new')}><Plus size={14} /> New Material</button>}
        </>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} newField="created_at"
          onRowClick={(r) => navigate(`/masters/materials/${r.id}`)} printTitle="Material Master"
          onPrintAll={() => api.get('/materials', { scoped: false })}
          toolbar={<>
            <select className="input w-40" value={cls} onChange={(e) => {
              const c = cats.find((x) => x.id === cat);
              setCls(e.target.value);
              if (c && e.target.value && c.classification && c.classification !== e.target.value) setCat('');
            }}>
              <option value="">All classifications</option>
              {CLASSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input w-40" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {categoriesFor(cats, cls, cat).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            </select>
          </>} />
      </div>
      {modal?.type === 'delete' && <DeleteDialog label={`${modal.row.code} ${modal.row.name}`} path={`/materials/${modal.row.id}`} onClose={close} onDone={done()} />}
      {modal?.type === 'bulk' && <BulkDialog entity="materials" mode={modal.mode} onClose={close} onDone={done()} />}
    </div>
  );
}
