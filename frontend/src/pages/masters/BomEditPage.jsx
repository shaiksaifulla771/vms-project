import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { Combobox, LocationWarehouse, materialOptions, useDefaultScope, useMaterials, useMpns } from '../../components/pickers';

const emptyLine = () => ({ material_id: '', mpn_id: '', qty_per_batch: '', uom: '', scrap_allowance_pct: '0' });

export default function BomEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const def = useDefaultScope();
  const materials = useMaterials({ status: 'ACTIVE' });
  const products = materials.filter((m) => ['FINISHED_GOOD', 'SEMI_FINISHED'].includes(m.classification));
  const mpns = useMpns();
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      setF({ product_id: '', location_id: def.locationId, warehouse_id: def.warehouseId, batch_size: '', batch_uom: 'kg',
        expected_output_qty: '', output_uom: '', notes: '', lines: [emptyLine()] });
      return;
    }
    api.get(`/boms/${id}`).then((b) => setF({
      ...b, lines: b.lines.map((l) => ({ material_id: l.material_id, mpn_id: l.mpn_id || '', qty_per_batch: String(l.qty_per_batch),
        uom: l.uom, scrap_allowance_pct: String(l.scrap_allowance_pct) })),
    })).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!f) return err ? <div className="p-5"><ErrorBox message={err} /></div> : <Loading />;

  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const batchTotal = f.lines.reduce((s, l) => s + (l.uom === f.batch_uom ? Number(l.qty_per_batch || 0) : 0), 0);

  const save = async (activate) => {
    setErr(null);
    setBusy(true);
    try {
      const body = {
        ...f, activate,
        batch_size: Number(f.batch_size), expected_output_qty: Number(f.expected_output_qty),
        lines: f.lines.filter((l) => l.material_id).map((l) => ({ ...l, mpn_id: l.mpn_id || null,
          qty_per_batch: Number(l.qty_per_batch), scrap_allowance_pct: Number(l.scrap_allowance_pct || 0) })),
      };
      const r = id ? await api.put(`/boms/${id}`, body) : await api.post('/boms', body);
      if (id && activate) await api.post(`/boms/${id}/activate`);
      notify(activate ? 'BOM saved and activated' : 'BOM saved as draft');
      navigate(`/masters/boms/${r.id}`);
    } catch (e) { setErr(e.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  const product = materials.find((m) => m.id === f.product_id);
  return (
    <div>
      <PageHeader title={id ? `Edit ${f.bom_no} (Draft v${f.version})` : 'New BOM'}
        subtitle="Header: Batch Size, Expected Output, UOM, Location, WH. Lines: Material / MPN, Qty per Batch, UOM, Scrap Allowance %." />
      <div className="p-5 space-y-4">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        <section className="card p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Product" required>
              <Combobox value={f.product_id} disabled={!!id} options={materialOptions(products)}
                onChange={(v) => { const p = materials.find((m) => m.id === v); setF({ ...f, product_id: v, output_uom: f.output_uom || p?.uom || '' }); }} />
            </Field>
            <div className="col-span-2">
              <LocationWarehouse locationId={f.location_id} warehouseId={f.warehouse_id} required disabledLocation={!!id}
                onChange={(l, w) => setF({ ...f, location_id: l, warehouse_id: w })} />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-3">
            <Field label="Batch Size" required><input className="input num" type="number" min="0" step="any" value={f.batch_size} onChange={(e) => setF({ ...f, batch_size: e.target.value })} /></Field>
            <Field label="Batch UOM" required><input className="input" value={f.batch_uom} onChange={(e) => setF({ ...f, batch_uom: e.target.value })} /></Field>
            <Field label="Expected Output Qty" required><input className="input num" type="number" min="0" step="any" value={f.expected_output_qty} onChange={(e) => setF({ ...f, expected_output_qty: e.target.value })} /></Field>
            <Field label="Output UOM" required hint={product ? `Product UOM: ${product.uom}` : ''}><input className="input" value={f.output_uom} onChange={(e) => setF({ ...f, output_uom: e.target.value })} /></Field>
            <Field label="Notes" className="col-span-2"><input className="input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </section>

        <section className="card">
          <table className="w-full">
            <thead><tr>
              <th className="th w-10">#</th><th className="th">Material</th><th className="th">Preferred MPN</th>
              <th className="th text-right">Qty per Batch</th><th className="th w-24">UOM</th><th className="th text-right">Scrap %</th><th className="th w-10" />
            </tr></thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i}>
                  <td className="td">{i + 1}</td>
                  <td className="td w-[34%]">
                    <Combobox value={l.material_id} options={materialOptions(materials.filter((m) => m.id !== f.product_id))}
                      onChange={(v) => { const m = materials.find((x) => x.id === v); setLine(i, { material_id: v, uom: m?.uom || '', mpn_id: '' }); }} />
                  </td>
                  <td className="td">
                    <select className="input" value={l.mpn_id} onChange={(e) => setLine(i, { mpn_id: e.target.value })} disabled={!l.material_id}>
                      <option value="">Any MPN</option>
                      {mpns.filter((p) => p.material_id === l.material_id).map((p) => <option key={p.id} value={p.id}>{p.mpn_code}</option>)}
                    </select>
                  </td>
                  <td className="td"><input className="input num w-32 ml-auto" type="number" min="0" step="any" value={l.qty_per_batch} onChange={(e) => setLine(i, { qty_per_batch: e.target.value })} /></td>
                  <td className="td"><input className="input" value={l.uom} readOnly title="Material base UOM" /></td>
                  <td className="td"><input className="input num w-20 ml-auto" type="number" min="0" max="99" step="any" value={l.scrap_allowance_pct} onChange={(e) => setLine(i, { scrap_allowance_pct: e.target.value })} /></td>
                  <td className="td"><button type="button" className="btn-danger-link" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 border-t border-line">
            <button type="button" className="btn-link" onClick={() => setF({ ...f, lines: [...f.lines, emptyLine()] })}><Plus size={13} /> Add line</button>
            <span className="text-xs text-ink-muted">Sum of lines in {f.batch_uom}: {batchTotal.toLocaleString('en-IN', { maximumFractionDigits: 4 })} (batch size {f.batch_size || 0})</span>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => save(false)}>Save Draft</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => save(true)}>Save & Activate</button>
        </div>
      </div>
    </div>
  );
}
