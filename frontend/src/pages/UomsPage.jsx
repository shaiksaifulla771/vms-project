import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/app-context';
import { ErrorBox, Field, Modal, PageHeader, Status } from '../components/ui';
import { UOM_TYPE_LABEL, useUoms } from '../components/pickers';
import { DeleteDialog } from '../components/masterKit';

function UomForm({ uom, onClose, onDone }) {
  const [f, setF] = useState(uom ? { ...uom } : { code: '', name: '', uom_type: 'COUNT', status: 'ACTIVE', sort_order: '' });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { code: f.code, name: f.name, uom_type: f.uom_type, status: f.status, sort_order: f.sort_order === '' ? undefined : Number(f.sort_order) };
      if (uom) await api.put(`/uoms/${encodeURIComponent(uom.code)}`, body);
      else await api.post('/uoms', body);
      onDone();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={uom ? `Edit UOM ${uom.code}` : 'New UOM'} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" required hint={uom?.use_count ? 'In use, so the code cannot change' : 'Short, no spaces (kg, pcs, box)'}>
          <input className="input" autoFocus={!uom} value={f.code} disabled={Boolean(uom?.use_count)} onChange={set('code')} />
        </Field>
        <Field label="Name" required><input className="input" autoFocus={Boolean(uom)} value={f.name} onChange={set('name')} /></Field>
        <Field label="Type">
          <select className="input" value={f.uom_type} onChange={set('uom_type')}>
            {Object.entries(UOM_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Status" hint="Inactive = not offered for new records">
          <select className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first"><input className="input num" type="number" min="0" value={f.sort_order ?? ''} onChange={set('sort_order')} /></Field>
      </div>
    </Modal>
  );
}

export default function UomsPage() {
  const { canWrite, notify } = useApp();
  const [k, setK] = useState(0);
  const uoms = useUoms(k);
  const [modal, setModal] = useState(null);
  const done = (msg) => { setModal(null); if (msg) notify(msg); setK((x) => x + 1); };

  return (
    <div>
      <PageHeader title="Units of Measure" subtitle="The UOM list offered on Materials, MPNs, BOMs and bulk templates"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({ isNew: true })}><Plus size={14} /> New UOM</button>} />
      <div className="p-5">
        <div className="card overflow-hidden max-w-4xl">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Code</th><th className="th">Name</th><th className="th">Type</th><th className="th text-right">Used by</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {uoms.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>Loading...</td></tr>}
              {uoms.map((u) => (
                <tr key={u.code} className="hover:bg-panel">
                  <td className="td font-medium">{u.code}</td>
                  <td className="td">{u.name}</td>
                  <td className="td text-ink-muted">{UOM_TYPE_LABEL[u.uom_type]}</td>
                  <td className="td num">{u.use_count}</td>
                  <td className="td"><Status value={u.status} /></td>
                  <td className="td text-right">
                    {canWrite && (
                      <span className="inline-flex gap-1">
                        <button type="button" title="Edit" className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted hover:text-accent hover:bg-panel" onClick={() => setModal({ uom: u })}><Pencil size={14} /></button>
                        <button type="button" title="Delete" className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted hover:text-danger hover:bg-panel" onClick={() => setModal({ del: u })}><Trash2 size={14} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(modal?.isNew || modal?.uom) && <UomForm uom={modal.uom} onClose={() => setModal(null)} onDone={() => done('UOM saved')} />}
      {modal?.del && <DeleteDialog label={`${modal.del.code} - ${modal.del.name}`} path={`/uoms/${encodeURIComponent(modal.del.code)}`} onClose={() => setModal(null)} onDone={() => done()} />}
    </div>
  );
}
