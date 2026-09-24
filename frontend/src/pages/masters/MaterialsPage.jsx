import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtDateTime } from '../../lib/format';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';
import { Link } from 'react-router-dom';
import { UomSelect, categoriesFor, useCategories, useUoms } from '../../components/pickers';
import { BulkDialog, DeleteDialog, DetailGrid, FunctionsMenu, actionsColumn } from '../../components/masterKit';

const CLASSES = Object.entries(CLASS_LABEL);

export function MaterialForm({ material, onClose, onDone, preset }) {
  const cats = useCategories();
  const uoms = useUoms();
  const { canWrite } = useApp();
  const isNew = !material;
  const [f, setF] = useState(material
    ? { ...material, shelf_life_days: material.shelf_life_days ?? '', category_id: material.category_id || '',
      sub_category_id: material.sub_category_id || '', description: material.description || '' }
    : { name: '', classification: 'RAW_MATERIAL', uom: 'kg', shelf_life_days: '', status: 'ACTIVE', category_id: '',
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

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const body = {
        name: f.name, classification: f.classification, uom: f.uom, status: f.status,
        shelf_life_days: f.shelf_life_days === '' ? null : Number(f.shelf_life_days),
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
          <select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value, sub_category_id: '' })}>
            <option value="">-</option>
            {catChoices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Sub-category" hint={f.category_id && !subs.length ? 'No sub-categories under this category' : ''}>
          <select className="input" value={f.sub_category_id} onChange={set('sub_category_id')} disabled={!f.category_id || !subs.length}>
            <option value="">-</option>
            {subs.filter((s) => s.status === 'ACTIVE' || s.id === f.sub_category_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Base UOM" required hint="Inventory is kept in this unit">
          <UomSelect value={f.uom} uoms={uoms} onChange={(u) => setF({ ...f, uom: u })} placeholder="Select UOM" />
        </Field>
        <Field label="Shelf Life (days)" hint="Suggests expiry dates"><input className="input num" type="number" min="1" value={f.shelf_life_days} onChange={set('shelf_life_days')} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </Field>
        <Field label="Description" className="col-span-3">
          <textarea className="input h-16 py-1.5" value={f.description} onChange={set('description')} maxLength={2000} />
        </Field>
      </div>
      {isNew && (
        <p className="border-t border-line pt-3 text-xs2 text-ink-muted">
          Vendors and prices are added in <b>MPNs</b> (material + vendor + UOM + MOQ + price) after saving.
          {['FINISHED_GOOD', 'SEMI_FINISHED'].includes(f.classification) && ' Finished and semi-finished goods get their own MPN automatically.'}
        </p>
      )}
    </Modal>
  );
}

function MaterialView({ id, onClose, onEdit, canWrite }) {
  const { data: m, error } = useData(() => api.get(`/materials/${id}`, { scoped: false }), [id]);
  return (
    <Modal title={m ? `${m.code} - ${m.name}` : 'Material'} onClose={onClose} width="max-w-3xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        {canWrite && m && <button type="button" className="btn-primary" onClick={() => onEdit(m)}>Edit</button>}</>}>
      <ErrorBox message={error} />
      {m && (
        <div className="space-y-4">
          <DetailGrid items={[
            ['Material Code', m.code], ['Material Name', m.name, 'col-span-2'],
            ['Classification', CLASS_LABEL[m.classification]], ['Category', m.category_name], ['Sub-category', m.sub_category_name],
            ['Base UOM', m.uom], ['Shelf Life (days)', m.shelf_life_days], ['Status', <Status key="s" value={m.status} />],
            ['Description', m.description, 'col-span-3'],
            ['Created', fmtDateTime(m.created_at)], ['Last updated', fmtDateTime(m.updated_at)],
          ]} />
          <div>
            <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">MPNs and vendor prices</div>
            <table className="w-full border-collapse border border-line">
              <thead><tr><th className="th">MPN</th><th className="th">Vendor</th><th className="th">UOM</th><th className="th text-right">MOQ</th><th className="th text-right">Price (₹)</th><th className="th">Status</th></tr></thead>
              <tbody>
                {m.mpns.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>No MPNs yet</td></tr>}
                {m.mpns.flatMap((p) => (p.vendors.length ? p.vendors : [{}]).map((v, i) => (
                  <tr key={`${p.id}-${i}`}>
                    <td className="td">{i === 0 ? p.mpn_code : ''}</td>
                    <td className="td">{v.vendor_name ? `${v.vendor_code} - ${v.vendor_name}${v.is_preferred ? ' (preferred)' : ''}` : <span className="text-ink-faint">-</span>}</td>
                    <td className="td">{v.uom}</td><td className="td num">{v.moq}</td><td className="td num">{v.price}</td>
                    <td className="td">{i === 0 && <Status value={p.status} />}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <div className="text-[13px]"><span className="text-ink-muted">Supplied by (from MPNs): </span>{m.vendors.length ? m.vendors.map((v) => `${v.code} - ${v.name}`).join(', ') : '-'}</div>
        </div>
      )}
    </Modal>
  );
}

export default function MaterialsPage() {
  const { canWrite, notify } = useApp();
  const cats = useCategories();
  const [cls, setCls] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(
    () => api.get(`/materials${qs({ classification: cls, category_id: cat, status })}`, { scoped: false }), [cls, cat, status]);
  const close = () => setModal(null);
  const done = (msg) => () => { setModal(null); if (msg) notify(msg); reload(); };

  const columns = [
    { key: 'code', label: 'Material Code' },
    { key: 'name', label: 'Material Name', className: 'whitespace-normal min-w-[200px]' },
    { key: 'classification', label: 'Classification', value: (r) => CLASS_LABEL[r.classification] },
    { key: 'category_name', label: 'Category' },
    { key: 'sub_category_name', label: 'Sub-category' },
    { key: 'mpns', label: 'MPN(s)', value: (r) => r.mpns.map((m) => m.mpn_code).join(', '), className: 'whitespace-normal max-w-[220px]' },
    { key: 'uom', label: 'UOM' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
    actionsColumn({
      canWrite,
      onView: (r) => setModal({ type: 'view', id: r.id }),
      onEdit: (r) => setModal({ type: 'edit', material: r }),
      onDelete: (r) => setModal({ type: 'delete', row: r }),
    }),
  ];

  return (
    <div>
      <PageHeader title="Material Master" subtitle="Raw materials, packaging and finished goods · codes are assigned automatically"
        actions={<>
          <FunctionsMenu entity="materials" onManual={() => setModal({ type: 'edit' })} onBulk={(mode) => setModal({ type: 'bulk', mode })} />
          {canWrite && <button type="button" className="btn-primary" onClick={() => setModal({ type: 'edit' })}><Plus size={14} /> New Material</button>}
        </>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} newField="created_at"
          onRowClick={(r) => setModal({ type: 'view', id: r.id })}
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
      {modal?.type === 'edit' && <MaterialForm material={modal.material} onClose={close}
        onDone={(m) => { setModal(null); notify(modal.material ? 'Material saved' : `Material ${m.code} created`); reload(); }} />}
      {modal?.type === 'view' && <MaterialView id={modal.id} canWrite={canWrite} onClose={close} onEdit={(m) => setModal({ type: 'edit', material: m })} />}
      {modal?.type === 'delete' && <DeleteDialog label={`${modal.row.code} ${modal.row.name}`} path={`/materials/${modal.row.id}`} onClose={close} onDone={done()} />}
      {modal?.type === 'bulk' && <BulkDialog entity="materials" mode={modal.mode} onClose={close} onDone={done()} />}
    </div>
  );
}
