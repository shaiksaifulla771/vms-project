import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';
import { Combobox, materialOptions, useMaterials, useVendors } from '../../components/pickers';

function MpnModal({ mpn, onClose, onDone }) {
  const materials = useMaterials();
  const vendors = useVendors();
  const isNew = !mpn;
  const [f, setF] = useState(mpn ? { ...mpn, vendors: mpn.vendors.map((v) => ({ vendor_id: v.vendor_id, is_preferred: v.is_preferred })) }
    : { mpn_code: '', material_id: '', manufacturer: '', description: '', vendors: [] });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    try {
      if (isNew) await api.post('/mpns', f); else await api.put(`/mpns/${mpn.id}`, f);
      onDone();
    } catch (e) { setErr(e.message); }
  };
  const setVendor = (i, patch) => setF({ ...f, vendors: f.vendors.map((v, j) => (j === i ? { ...v, ...patch } : (patch.is_preferred ? { ...v, is_preferred: false } : v))) });
  return (
    <Modal title={isNew ? 'New MPN' : `MPN ${mpn.mpn_code}`} onClose={onClose} width="max-w-2xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} onClose={() => setErr(null)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="MPN" required><input className="input" value={f.mpn_code} disabled={!isNew} onChange={(e) => setF({ ...f, mpn_code: e.target.value })} /></Field>
        <Field label="Material" required>
          <Combobox value={f.material_id} disabled={!isNew} onChange={(v) => setF({ ...f, material_id: v })} options={materialOptions(materials)} />
        </Field>
        <Field label="Manufacturer"><input className="input" value={f.manufacturer || ''} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} /></Field>
        {!isNew && (
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></Field>
        )}
      </div>
      <div>
        <div className="label">MPN-Vendor Mapping</div>
        <table className="w-full card">
          <thead><tr><th className="th">Vendor</th><th className="th w-24">Preferred</th><th className="th w-10" /></tr></thead>
          <tbody>
            {f.vendors.length === 0 && <tr><td className="td text-ink-muted" colSpan={3}>No vendors mapped</td></tr>}
            {f.vendors.map((v, i) => (
              <tr key={i}>
                <td className="td">
                  <select className="input" value={v.vendor_id} onChange={(e) => setVendor(i, { vendor_id: e.target.value })}>
                    <option value="">Select vendor</option>
                    {vendors.map((x) => <option key={x.id} value={x.id}>{x.code} - {x.name}</option>)}
                  </select>
                </td>
                <td className="td"><input type="radio" checked={!!v.is_preferred} onChange={() => setVendor(i, { is_preferred: true })} /></td>
                <td className="td"><button type="button" className="btn-danger-link" onClick={() => setF({ ...f, vendors: f.vendors.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-link mt-2" onClick={() => setF({ ...f, vendors: [...f.vendors, { vendor_id: '', is_preferred: f.vendors.length === 0 }] })}><Plus size={13} /> Add vendor</button>
      </div>
    </Modal>
  );
}

export default function MpnsPage() {
  const { canWrite, notify } = useApp();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get('/mpns', { scoped: false }), []);
  const columns = [
    { key: 'mpn_code', label: 'MPN' },
    { key: 'material', label: 'Material', value: (r) => `${r.material_code} - ${r.material_name}` },
    { key: 'classification', label: 'Classification', value: (r) => r.classification.replace(/_/g, ' ') },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'vendors', label: 'Vendor(s)', value: (r) => r.vendors.map((v) => `${v.vendor_name}${v.is_preferred && r.vendors.length > 1 ? ' (preferred)' : ''}`).join(', ') },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="MPN & Vendor Mapping" subtitle="Manufacturer Part Numbers and the vendors that supply them"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({})}><Plus size={14} /> New MPN</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="mpn_vendors"
          onRowClick={canWrite ? (r) => setModal({ mpn: r }) : undefined} />
      </div>
      {modal && <MpnModal mpn={modal.mpn} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('MPN saved'); reload(); }} />}
    </div>
  );
}
