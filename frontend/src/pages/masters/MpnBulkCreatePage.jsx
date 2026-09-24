import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { ErrorBox, PageHeader } from '../../components/ui';
import { Combobox, UomSelect, materialOptions, useMaterials, useUoms, useVendors } from '../../components/pickers';
import { sortedVendorOptions } from './MpnsPage';

let seq = 0;
const blankRow = (from) => ({ _k: (seq += 1), material_id: '', vendor_id: from?.vendor_id || '', uom: '', moq: '', price: '', lead_time_days: from?.lead_time_days || '', manufacturer: '' });

/**
 * Bulk MPN Create: pick material + vendor per row and define UOM, MOQ and price.
 * One MPN is created per row (code assigned automatically). All rows are saved together or none.
 */
export default function MpnBulkCreatePage() {
  const navigate = useNavigate();
  const { notify } = useApp();
  const materials = useMaterials({ status: 'ACTIVE' });
  const vendors = useVendors();
  const uoms = useUoms();
  const [rows, setRows] = useState(() => [blankRow(), blankRow(), blankRow()]);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const set = (i, patch) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    if (patch.material_id && !r.uom) next.uom = materials.find((m) => m.id === patch.material_id)?.uom || '';
    return next;
  }));
  const filled = rows.filter((r) => r.material_id || r.vendor_id || r.price !== '' || r.moq !== '');
  const vOpts = sortedVendorOptions(vendors, []);

  const save = async () => {
    setErr(null); setErrors({}); setBusy(true);
    const payload = filled.map((r) => ({
      row_no: rows.indexOf(r) + 1, material_id: r.material_id || null, vendor_id: r.vendor_id || null, uom: r.uom,
      moq: r.moq, price: r.price, lead_time_days: r.lead_time_days, manufacturer: r.manufacturer,
    }));
    try {
      const res = await api.post('/mpns/bulk', { rows: payload }, { scoped: false });
      setResult(res.rows.map((x) => ({ ...x, row: rows[x.row_no - 1] })));
      notify(`${res.created} MPNs created`);
    } catch (e) {
      setErr(e.message);
      if (e.data?.rows) setErrors(Object.fromEntries(e.data.rows.filter((r) => r.errors.length).map((r) => [r.row_no, r.errors])));
    }
    setBusy(false);
  };

  const matLabel = (id) => materials.find((m) => m.id === id);
  const venLabel = (id) => vendors.find((v) => v.id === id);

  if (result) {
    return (
      <div>
        <PageHeader title="Bulk MPN Create" actions={<>
          <button type="button" className="btn-secondary" onClick={() => { setResult(null); setRows([blankRow(), blankRow(), blankRow()]); }}>Create more</button>
          <button type="button" className="btn-primary" onClick={() => navigate('/masters/mpns')}>Go to MPNs</button>
        </>} />
        <div className="p-5">
          <div className="card overflow-hidden max-w-4xl">
            <table className="w-full border-collapse">
              <thead><tr><th className="th">New MPN</th><th className="th">Material</th><th className="th">Vendor</th><th className="th text-right">MOQ</th><th className="th text-right">Price (₹)</th></tr></thead>
              <tbody>{result.map((x) => {
                const m = matLabel(x.row.material_id); const v = venLabel(x.row.vendor_id);
                return <tr key={x.id}><td className="td font-medium">{x.code}</td><td className="td">{m ? `${m.code} - ${m.name}` : ''}</td><td className="td">{v ? `${v.code} - ${v.name}` : ''}</td><td className="td num">{x.row.moq}</td><td className="td num">{x.row.price}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Bulk MPN Create" subtitle="One row per material + vendor. MPN codes are assigned on save. If any row has an error, nothing is saved."
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => navigate('/masters/mpns')}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || filled.length === 0} onClick={save}>{busy ? 'Saving...' : `Save ${filled.length} row${filled.length === 1 ? '' : 's'}`}</button>
        </>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="th w-10">#</th><th className="th min-w-[260px]">Material *</th><th className="th min-w-[220px]">Vendor *</th>
                <th className="th w-20">UOM *</th><th className="th w-24 text-right">MOQ *</th><th className="th w-28 text-right">Price (₹) *</th>
                <th className="th w-24 text-right">Lead (d)</th><th className="th w-40">Manufacturer</th><th className="th w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <FragmentRow uoms={uoms} key={r._k} i={i} r={r} errors={errors[i + 1]} set={set} matOpts={materialOptions(materials.filter((m) => m.classification !== 'FINISHED_GOOD'))} vOpts={vOpts}
                  onCopy={() => setRows((rs) => [...rs.slice(0, i + 1), { ...blankRow(r), uom: '' }, ...rs.slice(i + 1)])}
                  onRemove={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blankRow()]))} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-link" onClick={() => setRows((rs) => [...rs, blankRow()])}><Plus size={13} /> Add row</button>
          <button type="button" className="btn-link" onClick={() => setRows((rs) => [...rs, ...Array.from({ length: 10 }, () => blankRow())])}><Plus size={13} /> Add 10 rows</button>
        </div>
        <p className="text-xs text-ink-muted">Tip: the copy icon adds a row below with the same vendor, so one vendor&apos;s price list goes in quickly. For hundreds of rows use Functions &gt; Bulk Entry with the Excel template.</p>
      </div>
    </div>
  );
}

function FragmentRow({ i, r, errors, set, matOpts, vOpts, onCopy, onRemove, uoms }) {
  return (
    <>
      <tr className={errors ? 'bg-red-50' : ''}>
        <td className="td num text-ink-muted">{i + 1}</td>
        <td className="td px-1"><Combobox value={r.material_id} onChange={(v) => set(i, { material_id: v })} options={matOpts} placeholder="Select material" /></td>
        <td className="td px-1"><Combobox value={r.vendor_id} onChange={(v) => set(i, { vendor_id: v })} options={vOpts} placeholder="Select vendor" /></td>
        <td className="td px-1"><UomSelect value={r.uom} uoms={uoms} onChange={(u) => set(i, { uom: u })} /></td>
        <td className="td px-1"><input className="input num" type="number" min="0" value={r.moq} onChange={(e) => set(i, { moq: e.target.value })} /></td>
        <td className="td px-1"><input className="input num" type="number" min="0" step="0.01" value={r.price} onChange={(e) => set(i, { price: e.target.value })} /></td>
        <td className="td px-1"><input className="input num" type="number" min="0" value={r.lead_time_days} onChange={(e) => set(i, { lead_time_days: e.target.value })} /></td>
        <td className="td px-1"><input className="input" value={r.manufacturer} onChange={(e) => set(i, { manufacturer: e.target.value })} /></td>
        <td className="td px-1 whitespace-nowrap">
          <button type="button" title="Copy vendor to a new row" className="h-7 w-7 inline-flex items-center justify-center text-ink-muted hover:text-accent" onClick={onCopy}><Copy size={13} /></button>
          <button type="button" title="Remove row" className="h-7 w-7 inline-flex items-center justify-center text-ink-muted hover:text-danger" onClick={onRemove}><Trash2 size={13} /></button>
        </td>
      </tr>
      {errors && (
        <tr className="bg-red-50"><td /><td colSpan={8} className="px-3 pb-2 text-xs text-danger">{errors.join(' · ')}</td></tr>
      )}
    </>
  );
}
