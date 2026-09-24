import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { ErrorBox, Field, isNewToday, Modal, NewTag, PageHeader } from '../../components/ui';

export default function LocationsPage() {
  const { locations, company, canWrite, reload, notify } = useApp();
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);

  const open = (type, extra = {}) => { setErr(null); setF(extra); setModal(type); };
  const save = async () => {
    setErr(null);
    try {
      if (modal === 'location') await api.post('/locations', f);
      if (modal === 'warehouse') await api.post(`/locations/${f.location_id}/warehouses`, f);
      setModal(null);
      notify('Saved');
      reload();
    } catch (e) { setErr(e.message); }
  };
  const makeDefault = async (w) => {
    try { await api.put(`/warehouses/${w.id}`, { is_default: true }); reload(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <PageHeader title="Locations & Warehouses" subtitle={`${company?.name || 'Company'} → Locations → Warehouses (WH is a sub-location)`}
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => open('location')}><Plus size={14} /> New Location</button>} />
      <div className="p-5 space-y-4">
        {!modal && <ErrorBox message={err} onClose={() => setErr(null)} />}
        {locations.map((l) => (
          <section key={l.id} className="card">
            <div className="flex items-center justify-between px-3 py-2 border-b border-line">
              <div><span className="font-semibold">{l.code}</span> - {l.name}<NewTag ts={l.created_at} /> <span className="text-ink-muted text-xs">{l.address}</span></div>
              {canWrite && <button type="button" className="btn-link" onClick={() => open('warehouse', { location_id: l.id })}><Plus size={13} /> Add Warehouse</button>}
            </div>
            <table className="w-full">
              <thead><tr><th className="th w-40">WH Code</th><th className="th">Name</th><th className="th w-32">Default</th><th className="th w-24">Active</th></tr></thead>
              <tbody>
                {l.warehouses.map((w) => (
                  <tr key={w.id} className={isNewToday(w.created_at) ? 'bg-accent-soft/40' : ''}>
                    <td className="td">{w.code}<NewTag ts={w.created_at} /></td>
                    <td className="td">{w.name}</td>
                    <td className="td">{w.is_default ? 'Default' : (canWrite && <button type="button" className="btn-link" onClick={() => makeDefault(w)}>Make default</button>)}</td>
                    <td className="td">{w.is_active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      {modal && (
        <Modal title={modal === 'location' ? 'New Location' : 'New Warehouse'} onClose={() => setModal(null)}
          footer={<><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
          <ErrorBox message={err} onClose={() => setErr(null)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required><input className="input" value={f.code || ''} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="Name" required><input className="input" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            {modal === 'location' && <>
              <Field label="Address" className="col-span-2"><input className="input" value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
              <Field label="Default WH Code" hint="Blank = WH-01"><input className="input" value={f.warehouse_code || ''} onChange={(e) => setF({ ...f, warehouse_code: e.target.value })} /></Field>
              <Field label="Default WH Name"><input className="input" value={f.warehouse_name || ''} onChange={(e) => setF({ ...f, warehouse_name: e.target.value })} /></Field>
            </>}
            {modal === 'warehouse' && (
              <label className="flex items-center gap-1.5 text-ink-soft col-span-2"><input type="checkbox" checked={!!f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked })} /> Make this the default warehouse</label>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
