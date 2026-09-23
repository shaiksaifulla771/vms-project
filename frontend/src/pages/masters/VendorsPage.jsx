import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';

const FIELDS = [
  ['name', 'Vendor Name', true, 'col-span-2'], ['contact_email', 'Email'], ['phone', 'Phone'], ['gstin', 'GSTIN'],
  ['city', 'City'], ['state', 'State'], ['country', 'Country'], ['address', 'Address', false, 'col-span-3'],
];

function VendorModal({ vendor, onClose, onDone }) {
  const isNew = !vendor;
  const [f, setF] = useState(vendor || { code: '', status: 'ACTIVE' });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    try {
      if (isNew) await api.post('/vendors', f); else await api.put(`/vendors/${vendor.id}`, f);
      onDone();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={isNew ? 'New Vendor' : `Vendor ${vendor.code}`} onClose={onClose} width="max-w-2xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} onClose={() => setErr(null)} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Vendor Code" hint={isNew ? 'Blank = next V-number' : ''}><input className="input" value={f.code || ''} disabled={!isNew} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        {FIELDS.map(([k, label, req, cls]) => (
          <Field key={k} label={label} required={req} className={cls || ''}><input className="input" value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
        {!isNew && (
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></Field>
        )}
      </div>
    </Modal>
  );
}

export default function VendorsPage() {
  const { canWrite, notify } = useApp();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get('/vendors', { scoped: false }), []);
  const columns = [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Vendor Name' }, { key: 'city', label: 'City' },
    { key: 'contact_email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'gstin', label: 'GSTIN' },
    { key: 'mpn_count', label: 'MPNs', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Vendors"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({})}><Plus size={14} /> New Vendor</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="vendors"
          onRowClick={canWrite ? (r) => setModal({ vendor: r }) : undefined} />
      </div>
      {modal && <VendorModal vendor={modal.vendor} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Vendor saved'); reload(); }} />}
    </div>
  );
}
