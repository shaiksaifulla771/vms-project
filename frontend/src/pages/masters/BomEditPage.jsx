import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { Combobox, LocationWarehouse, UomSelect, materialOptions, useDefaultScope, useMaterials, useMpns, useUoms } from '../../components/pickers';

const emptyLine = () => ({ material_id: '', mpn_id: '', qty_per_batch: '', uom: '', scrap_allowance_pct: '0', unit_price: '', notes: '' });
const COSTS = [['packing_cost', 'Packing Cost'], ['processing_cost', 'Processing Cost'], ['overhead_cost', 'Overhead Cost'], ['freight_cost', 'Freight Cost']];
const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Default price for a line: the chosen MPN's preferred vendor, else any priced MPN of the material. */
function priceSource(mpns, l) {
  const cands = l.mpn_id ? mpns.filter((p) => p.id === l.mpn_id) : mpns.filter((p) => p.material_id === l.material_id);
  for (const p of cands) {
    const v = [...p.vendors].sort((a, b) => Number(b.is_preferred) - Number(a.is_preferred)).find((x) => x.price !== null && x.price !== undefined);
    if (v) return { price: Number(v.price), vendor: v.vendor_name, uom: v.uom };
  }
  const v = cands[0]?.vendors?.[0];
  return { price: null, vendor: v?.vendor_name || null };
}

export default function BomEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const def = useDefaultScope();
  const materials = useMaterials({ status: 'ACTIVE' });
  const products = materials.filter((m) => ['FINISHED_GOOD', 'SEMI_FINISHED'].includes(m.classification));
  const mpns = useMpns();
  const uoms = useUoms();
  const [search] = useSearchParams();
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  // Output UOM follows the product (e.g. when opened from Products > Create BOM)
  useEffect(() => {
    if (f && f.product_id && !f.output_uom) {
      const p = materials.find((m) => m.id === f.product_id);
      if (p) setF((x) => ({ ...x, output_uom: p.uom }));
    }
  }, [f, materials]);

  useEffect(() => {
    if (!id) {
      // ?product_id= comes from Products > Create BOM
      setF({ product_id: search.get('product_id') || '', location_id: def.locationId, warehouse_id: def.warehouseId, batch_size: '', batch_uom: 'kg',
        expected_output_qty: '', output_uom: '', notes: '', packing_cost: '', processing_cost: '', overhead_cost: '', freight_cost: '',
        lines: [emptyLine()] });
      return;
    }
    api.get(`/boms/${id}`).then((b) => setF({
      ...b,
      ...Object.fromEntries(COSTS.map(([k]) => [k, b[k] ? String(b[k]) : ''])),
      lines: b.lines.map((l) => ({ material_id: l.material_id, mpn_id: l.mpn_id || '', qty_per_batch: String(l.qty_per_batch),
        uom: l.uom, scrap_allowance_pct: String(l.scrap_allowance_pct), unit_price: l.unit_price == null ? '' : String(l.unit_price), notes: l.notes || '' })),
    })).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!f) return err ? <div className="p-5"><ErrorBox message={err} /></div> : <Loading />;

  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const batchTotal = f.lines.reduce((s, l) => s + (l.uom === f.batch_uom ? Number(l.qty_per_batch || 0) : 0), 0);
  const priced = f.lines.map((l) => {
    const src = l.material_id ? priceSource(mpns, l) : { price: null };
    const price = l.unit_price !== '' ? Number(l.unit_price) : src.price;
    const gross = Number(l.qty_per_batch || 0) * (1 + Number(l.scrap_allowance_pct || 0) / 100);
    return { ...src, price, cost: price == null ? null : gross * price };
  });
  const materialCost = priced.reduce((a, p) => a + (p.cost || 0), 0);
  const extraCost = COSTS.reduce((a, [k]) => a + Number(f[k] || 0), 0);
  const totalCost = materialCost + extraCost;
  const perUnit = Number(f.expected_output_qty) > 0 ? totalCost / Number(f.expected_output_qty) : null;

  const save = async (activate) => {
    setErr(null);
    setBusy(true);
    try {
      const body = {
        ...f, activate,
        batch_size: Number(f.batch_size), expected_output_qty: Number(f.expected_output_qty),
        ...Object.fromEntries(COSTS.map(([k]) => [k, f[k] === '' ? 0 : Number(f[k])])),
        lines: f.lines.filter((l) => l.material_id).map((l) => ({ ...l, mpn_id: l.mpn_id || null,
          qty_per_batch: Number(l.qty_per_batch), scrap_allowance_pct: Number(l.scrap_allowance_pct || 0),
          unit_price: l.unit_price === '' ? null : Number(l.unit_price), notes: l.notes || null })),
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
        subtitle="Header: batch size, expected output, location, WH and batch costs. Ingredients: material / MPN, qty, loss %, price." />
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
            <Field label="Batch UOM" required><UomSelect value={f.batch_uom} uoms={uoms} onChange={(u) => setF({ ...f, batch_uom: u })} placeholder="Select" /></Field>
            <Field label="Expected Output Qty" required><input className="input num" type="number" min="0" step="any" value={f.expected_output_qty} onChange={(e) => setF({ ...f, expected_output_qty: e.target.value })} /></Field>
            <Field label="Output UOM" required hint={product ? `Product UOM: ${product.uom}` : ''}><UomSelect value={f.output_uom} uoms={uoms} onChange={(u) => setF({ ...f, output_uom: u })} placeholder="Select" /></Field>
            <Field label="Notes" className="col-span-2"><input className="input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </section>

        <section className="card p-3">
          <div className="text-[13px] font-semibold mb-2">Batch costs (₹ per batch)</div>
          <div className="grid grid-cols-6 gap-3 items-end">
            {COSTS.map(([k, label]) => (
              <Field key={k} label={label}><input className="input num" type="number" min="0" step="0.01" value={f[k]} placeholder="0.00" onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
            ))}
            <div className="col-span-2 grid grid-cols-3 gap-2 text-[13px] border-l border-line pl-3">
              <div><div className="text-xs text-ink-muted">Material cost</div><div className="tabular-nums">₹ {money(materialCost)}</div></div>
              <div><div className="text-xs text-ink-muted">Total per batch</div><div className="tabular-nums font-semibold">₹ {money(totalCost)}</div></div>
              <div><div className="text-xs text-ink-muted">Per {f.output_uom || 'unit'}</div><div className="tabular-nums font-semibold">{perUnit == null ? '-' : `₹ ${perUnit.toLocaleString('en-IN', { maximumFractionDigits: 4 })}`}</div></div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th w-10">#</th><th className="th">Ingredient (material)</th><th className="th">MPN</th><th className="th">Vendor</th>
              <th className="th text-right">Qty per Batch</th><th className="th w-20">UOM</th><th className="th text-right">Loss %</th>
              <th className="th text-right">Price (₹)</th><th className="th text-right">Line Cost (₹)</th><th className="th">Notes</th><th className="th w-10" />
            </tr></thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i}>
                  <td className="td">{i + 1}</td>
                  <td className="td px-1"><div className="w-[300px]">
                    <Combobox value={l.material_id} options={materialOptions(materials.filter((m) => m.id !== f.product_id))}
                      onChange={(v) => { const m = materials.find((x) => x.id === v); setLine(i, { material_id: v, uom: m?.uom || '', mpn_id: '' }); }} />
                  </div></td>
                  <td className="td px-1"><div className="w-40">
                    <select className="input" value={l.mpn_id} onChange={(e) => setLine(i, { mpn_id: e.target.value })} disabled={!l.material_id}>
                      <option value="">Any MPN</option>
                      {mpns.filter((p) => p.material_id === l.material_id).map((p) => <option key={p.id} value={p.id}>{p.mpn_code}</option>)}
                    </select>
                  </div></td>
                  <td className="td text-ink-soft">{priced[i].vendor || <span className="text-ink-faint">-</span>}</td>
                  <td className="td px-1"><input className="input num w-28 ml-auto" type="number" min="0" step="any" value={l.qty_per_batch} onChange={(e) => setLine(i, { qty_per_batch: e.target.value })} /></td>
                  <td className="td px-1"><input className="input" value={l.uom} readOnly title="Material base UOM" /></td>
                  <td className="td px-1"><input className="input num w-16 ml-auto" type="number" min="0" max="99" step="any" value={l.scrap_allowance_pct} onChange={(e) => setLine(i, { scrap_allowance_pct: e.target.value })} /></td>
                  <td className="td px-1"><input className="input num w-24 ml-auto" type="number" min="0" step="0.01" value={l.unit_price}
                    placeholder={priced[i].price != null && l.unit_price === '' ? String(priced[i].price) : ''}
                    title="Leave blank to use the MPN price; type a value to override" onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                  <td className="td num">{priced[i].cost == null ? <span className="text-ink-faint" title="No price">-</span> : money(priced[i].cost)}</td>
                  <td className="td px-1"><input className="input w-36" value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} /></td>
                  <td className="td"><button type="button" className="btn-danger-link" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-line">
            <button type="button" className="btn-link" onClick={() => setF({ ...f, lines: [...f.lines, emptyLine()] })}><Plus size={13} /> Add line</button>
            <span className="text-xs text-ink-muted">Sum of lines in {f.batch_uom}: {batchTotal.toLocaleString('en-IN', { maximumFractionDigits: 4 })} (batch size {f.batch_size || 0}) · Price blank = MPN price; line cost includes loss %</span>
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
