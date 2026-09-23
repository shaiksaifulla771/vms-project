import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL } from '../../lib/format';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';
import { useVendors } from '../../components/pickers';

const CLASSES = Object.entries(CLASS_LABEL);

function MaterialModal({ material, onClose, onDone }) {
  const vendors = useVendors();
  const isNew = !material;
  const [f, setF] = useState(material ? { ...material, shelf_life_days: material.shelf_life_days ?? '' }
    : { code: '', name: '', classification: 'RAW_MATERIAL', uom: 'kg', shelf_life_days: '', mpn_code: '', vendor_id: '' });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(null);
    try {
      const body = { ...f, shelf_life_days: f.shelf_life_days === '' ? null : Number(f.shelf_life_days) };
      if (isNew) await api.post('/materials', body); else await api.put(`/materials/${material.id}`, body);
      onDone();
    } catch (e) { setErr(e.message); }
  };
  const produced = ['FINISHED_GOOD', 'SEMI_FINISHED'].includes(f.classification);
  return (
    <Modal title={isNew ? 'New Material' : `Edit ${material.code}`} onClose={onClose} width="max-w-2xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} onClose={() => setErr(null)} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Material Code" required><input className="input" value={f.code} disabled={!isNew} onChange={set('code')} /></Field>
        <Field label="Material Name" required className="col-span-2"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Classification" required>
          <select className="input" value={f.classification} onChange={set('classification')}>
            {CLASSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Base UOM" required hint="Inventory is kept in this unit"><input className="input" value={f.uom} onChange={set('uom')} /></Field>
        <Field label="Shelf Life (days)" hint="Suggests expiry dates"><input className="input num" type="number" min="1" value={f.shelf_life_days} onChange={set('shelf_life_days')} /></Field>
        {!isNew && (
          <Field label="Status">
            <select className="input" value={f.status} onChange={set('status')}><option>ACTIVE</option><option>INACTIVE</option></select>
          </Field>
        )}
      </div>
      {isNew && (
        <div className="border-t border-line pt-3 grid grid-cols-2 gap-3">
          <Field label="MPN" hint={produced ? 'Blank = material code (in-house product)' : 'Manufacturer Part Number (can be added later)'}>
            <input className="input" value={f.mpn_code} onChange={set('mpn_code')} />
          </Field>
          <Field label="Vendor for this MPN">
            <select className="input" value={f.vendor_id} onChange={set('vendor_id')} disabled={!f.mpn_code && !produced}>
              <option value="">-</option>
              {vendors.filter((v) => v.status === 'ACTIVE').map((v) => <option key={v.id} value={v.id}>{v.code} - {v.name}</option>)}
            </select>
          </Field>
        </div>
      )}
    </Modal>
  );
}

export default function MaterialsPage() {
  const { canWrite, notify } = useApp();
  const [cls, setCls] = useState('');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get(`/materials${qs({ classification: cls })}`, { scoped: false }), [cls]);
  const columns = [
    { key: 'code', label: 'Material ID' },
    { key: 'name', label: 'Material Name' },
    { key: 'classification', label: 'Classification', value: (r) => CLASS_LABEL[r.classification] },
    { key: 'mpns', label: 'MPN(s)', value: (r) => r.mpns.map((m) => m.mpn_code).join(', ') },
    { key: 'uom', label: 'UOM' },
    { key: 'shelf_life_days', label: 'Shelf Life (d)', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Material Master" subtitle="Raw materials, packaging and finished goods"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({})}><Plus size={14} /> New Material</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="materials"
          onRowClick={canWrite ? (r) => setModal({ material: r }) : undefined}
          toolbar={(
            <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">All classifications</option>
              {CLASSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )} />
      </div>
      {modal && <MaterialModal material={modal.material} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Material saved'); reload(); }} />}
    </div>
  );
}
