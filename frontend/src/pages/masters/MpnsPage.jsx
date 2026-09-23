import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Rows3, Trash2 } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDateTime, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';
import { Combobox, materialOptions, useMaterials, useVendors } from '../../components/pickers';
import { BulkDialog, DeleteDialog, DetailGrid, FunctionsMenu, actionsColumn } from '../../components/masterKit';

const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

/** Vendors that supply a material come first in vendor dropdowns. */
export function useSuppliers(materialId) {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    if (!materialId) { setIds([]); return; }
    api.get(`/vendors${qs({ material_id: materialId })}`, { scoped: false }).then((r) => setIds(r.map((v) => v.id))).catch(() => setIds([]));
  }, [materialId]);
  return ids;
}

export function sortedVendorOptions(vendors, supplierIds) {
  const set = new Set(supplierIds);
  return vendors.filter((v) => v.status === 'ACTIVE')
    .map((v) => ({ value: v.id, label: `${v.code} - ${v.name}`, sub: set.has(v.id) ? 'Supplies this material' : v.default_address || '' , s: set.has(v.id) ? 0 : 1 }))
    .sort((a, b) => a.s - b.s || a.label.localeCompare(b.label));
}

function MpnForm({ mpn, onClose, onDone }) {
  const materials = useMaterials({ status: 'ACTIVE' });
  const vendors = useVendors();
  const isNew = !mpn;
  const [f, setF] = useState(mpn
    ? { material_id: mpn.material_id, manufacturer: mpn.manufacturer || '', description: mpn.description || '', status: mpn.status,
      vendors: mpn.vendors.map((v) => ({ vendor_id: v.vendor_id, is_preferred: v.is_preferred, uom: v.uom || '', moq: v.moq ?? '', price: v.price ?? '', lead_time_days: v.lead_time_days ?? '' })) }
    : { material_id: '', manufacturer: '', description: '', status: 'ACTIVE', vendors: [] });
  const [err, setErr] = useState(null);
  const suppliers = useSuppliers(f.material_id);
  const mat = materials.find((m) => m.id === f.material_id);
  const vOpts = sortedVendorOptions(vendors, suppliers);

  const save = async () => {
    setErr(null);
    const body = {
      ...f,
      vendors: f.vendors.filter((v) => v.vendor_id).map((v) => ({
        ...v, moq: v.moq === '' ? null : Number(v.moq), price: v.price === '' ? null : Number(v.price),
        lead_time_days: v.lead_time_days === '' ? null : Number(v.lead_time_days), uom: v.uom || mat?.uom || null,
      })),
    };
    try {
      const r = isNew ? await api.post('/mpns', body, { scoped: false }) : await api.put(`/mpns/${mpn.id}`, body, { scoped: false });
      onDone(r);
    } catch (e) { setErr(e.message); }
  };
  const setVendor = (i, patch) => setF({ ...f, vendors: f.vendors.map((v, j) => (j === i ? { ...v, ...patch } : (patch.is_preferred ? { ...v, is_preferred: false } : v))) });

  return (
    <Modal title={isNew ? 'New MPN' : `Edit ${mpn.mpn_code}`} onClose={onClose} width="max-w-4xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} onClose={() => setErr(null)} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="MPN Code" hint={isNew ? 'Assigned on save (MPN1001, ...)' : 'Cannot be changed'}><input className="input" value={isNew ? 'Auto' : mpn.mpn_code} disabled /></Field>
        <div className="col-span-2">
          <span className="label">Material<span className="text-danger"> *</span></span>
          <Combobox value={f.material_id} disabled={!isNew} onChange={(v) => setF({ ...f, material_id: v })} options={materialOptions(materials)} />
        </div>
        <Field label="Manufacturer"><input className="input" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {!isNew && (
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
        )}
      </div>
      <div>
        <div className="label">Vendors, price and MOQ</div>
        <table className="w-full border border-line border-collapse">
          <thead><tr><th className="th">Vendor</th><th className="th w-20">UOM</th><th className="th w-24 text-right">MOQ</th><th className="th w-28 text-right">Price (₹)</th><th className="th w-24 text-right">Lead (d)</th><th className="th w-20">Preferred</th><th className="th w-10" /></tr></thead>
          <tbody>
            {f.vendors.length === 0 && <tr><td className="td text-ink-muted" colSpan={7}>No vendors yet</td></tr>}
            {f.vendors.map((v, i) => (
              <tr key={i}>
                <td className="td px-1 min-w-[220px]"><Combobox value={v.vendor_id} onChange={(x) => setVendor(i, { vendor_id: x })} options={vOpts} placeholder="Select vendor" /></td>
                <td className="td px-1"><input className="input" value={v.uom} placeholder={mat?.uom || ''} onChange={(e) => setVendor(i, { uom: e.target.value })} /></td>
                <td className="td px-1"><input className="input num" type="number" min="0" value={v.moq} onChange={(e) => setVendor(i, { moq: e.target.value })} /></td>
                <td className="td px-1"><input className="input num" type="number" min="0" step="0.01" value={v.price} onChange={(e) => setVendor(i, { price: e.target.value })} /></td>
                <td className="td px-1"><input className="input num" type="number" min="0" value={v.lead_time_days} onChange={(e) => setVendor(i, { lead_time_days: e.target.value })} /></td>
                <td className="td text-center"><input type="radio" checked={!!v.is_preferred} onChange={() => setVendor(i, { is_preferred: true })} /></td>
                <td className="td px-1"><button type="button" className="btn-danger-link" aria-label="Remove" onClick={() => setF({ ...f, vendors: f.vendors.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-link mt-2" onClick={() => setF({ ...f, vendors: [...f.vendors, { vendor_id: '', is_preferred: f.vendors.length === 0, uom: '', moq: '', price: '', lead_time_days: '' }] })}><Plus size={13} /> Add vendor</button>
        <p className="text-xs2 text-ink-faint mt-1">Price changes are kept in the price history.</p>
      </div>
    </Modal>
  );
}

function MpnView({ id, canWrite, onClose, onEdit }) {
  const { data: p, error } = useData(() => api.get(`/mpns/${id}`, { scoped: false }), [id]);
  return (
    <Modal title={p ? `${p.mpn_code} - ${p.material_name}` : 'MPN'} onClose={onClose} width="max-w-4xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        {canWrite && p && <button type="button" className="btn-primary" onClick={() => onEdit(p)}>Edit</button>}</>}>
      <ErrorBox message={error} />
      {p && (
        <div className="space-y-4">
          <DetailGrid items={[
            ['MPN Code', p.mpn_code], ['Material', `${p.material_code} - ${p.material_name}`, 'col-span-2'],
            ['Manufacturer', p.manufacturer], ['Description', p.description], ['Status', <Status key="s" value={p.status} />],
          ]} />
          <div>
            <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">Vendors</div>
            <table className="w-full border border-line border-collapse">
              <thead><tr><th className="th">Vendor</th><th className="th">UOM</th><th className="th text-right">MOQ</th><th className="th text-right">Price (₹)</th><th className="th text-right">Lead (d)</th><th className="th">Price updated</th></tr></thead>
              <tbody>
                {p.vendors.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>No vendors</td></tr>}
                {p.vendors.map((v) => (
                  <tr key={v.id}><td className="td">{v.vendor_code} - {v.vendor_name}{v.is_preferred ? <span className="text-ink-muted"> (preferred)</span> : ''}</td>
                    <td className="td">{v.uom}</td><td className="td num">{fmtQty(v.moq)}</td><td className="td num">{money(v.price)}</td>
                    <td className="td num">{v.lead_time_days}</td><td className="td">{fmtDateTime(v.price_updated_at)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">Price history</div>
            <table className="w-full border border-line border-collapse">
              <thead><tr><th className="th">When</th><th className="th">Vendor</th><th className="th text-right">Old price</th><th className="th text-right">New price</th><th className="th text-right">Old MOQ</th><th className="th text-right">New MOQ</th><th className="th">By</th></tr></thead>
              <tbody>
                {p.price_history.length === 0 && <tr><td className="td text-ink-muted" colSpan={7}>No changes yet</td></tr>}
                {p.price_history.map((h) => (
                  <tr key={h.id}><td className="td">{fmtDateTime(h.changed_at)}</td><td className="td">{h.vendor_name}</td>
                    <td className="td num">{money(h.old_price)}</td><td className="td num">{money(h.new_price)}</td>
                    <td className="td num">{fmtQty(h.old_moq)}</td><td className="td num">{fmtQty(h.new_moq)}</td><td className="td">{h.changed_by_name}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function MpnsPage() {
  const { canWrite, notify } = useApp();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get('/mpns', { scoped: false }), []);
  const close = () => setModal(null);
  const pref = (r) => r.vendors.find((v) => v.is_preferred) || r.vendors[0];

  const columns = [
    { key: 'mpn_code', label: 'MPN' },
    { key: 'material', label: 'Material', value: (r) => `${r.material_code} - ${r.material_name}`, className: 'whitespace-normal min-w-[200px]' },
    { key: 'classification', label: 'Classification', value: (r) => CLASS_LABEL[r.classification] },
    { key: 'vendors', label: 'Vendor(s)', value: (r) => r.vendors.map((v) => `${v.vendor_name}${v.is_preferred && r.vendors.length > 1 ? ' (preferred)' : ''}`).join(', '), className: 'whitespace-normal max-w-[240px]' },
    { key: 'uom', label: 'UOM', value: (r) => pref(r)?.uom || '' },
    { key: 'moq', label: 'MOQ', align: 'right', value: (r) => (pref(r)?.moq ?? null), render: (r) => fmtQty(pref(r)?.moq) },
    { key: 'price', label: 'Price (₹)', align: 'right', value: (r) => (pref(r)?.price ?? null), render: (r) => money(pref(r)?.price) },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status },
    actionsColumn({
      canWrite,
      onView: (r) => setModal({ type: 'view', id: r.id }),
      onEdit: (r) => setModal({ type: 'edit', mpn: r }),
      onDelete: (r) => setModal({ type: 'delete', row: r }),
    }),
  ];

  return (
    <div>
      <PageHeader title="MPNs" subtitle="Manufacturer Part Numbers with vendor price, MOQ and UOM · price shown is the preferred vendor's"
        actions={<>
          <FunctionsMenu entity="mpns" onManual={() => setModal({ type: 'edit' })} onBulk={(mode) => setModal({ type: 'bulk', mode })}
            extra={[{ label: 'Bulk MPN Create', icon: Rows3, onClick: () => navigate('/masters/mpns/bulk-create') }]} />
          {canWrite && <button type="button" className="btn-secondary" onClick={() => navigate('/masters/mpns/bulk-create')}><Rows3 size={14} /> Bulk MPN Create</button>}
          {canWrite && <button type="button" className="btn-primary" onClick={() => setModal({ type: 'edit' })}><Plus size={14} /> New MPN</button>}
        </>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} onRowClick={(r) => setModal({ type: 'view', id: r.id })} />
      </div>
      {modal?.type === 'edit' && <MpnForm mpn={modal.mpn} onClose={close} onDone={(r) => { close(); notify(modal.mpn ? 'MPN saved' : `MPN ${r.mpn_code} created`); reload(); }} />}
      {modal?.type === 'view' && <MpnView id={modal.id} canWrite={canWrite} onClose={close} onEdit={(p) => setModal({ type: 'edit', mpn: p })} />}
      {modal?.type === 'delete' && <DeleteDialog label={modal.row.mpn_code} path={`/mpns/${modal.row.id}`} onClose={close} onDone={() => { close(); reload(); }} />}
      {modal?.type === 'bulk' && <BulkDialog entity="mpns" mode={modal.mode} onClose={close} onDone={() => { close(); reload(); }} />}
    </div>
  );
}
