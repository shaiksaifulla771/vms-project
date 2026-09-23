import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { fmtDate, fmtPct, fmtQty } from '../../lib/format';
import { ErrorBox, Field, PageHeader } from '../../components/ui';
import { Combobox, materialOptions, useMaterials } from '../../components/pickers';

const r4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;
const variance = (actual, plan) => ({ qty: r4(Number(actual || 0) - Number(plan || 0)), pct: Number(plan) > 0 ? ((Number(actual || 0) - Number(plan)) / Number(plan)) * 100 : 0 });

function Section({ n, title, children }) {
  return (
    <section className="card">
      <div className="px-3 py-2 border-b border-line text-[13px] font-semibold">Section {n}: {title}</div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default function BatchEntryPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, locations, locationId: scopeLoc, isAdmin, canWrite, settings, notify } = useApp();
  const products = useMaterials({ producible: 'true', status: 'ACTIVE' });
  const allMaterials = useMaterials({ status: 'ACTIVE' });

  const [source, setSource] = useState('PLAN');
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(params.get('plan_id') || '');
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState(scopeLoc || '');
  const [pf, setPf] = useState(null);
  const [head, setHead] = useState({ batch_no: '', mfg_date: '', expiry_date: '', executed_by: user?.full_name || '', warehouse_id: '' });
  const [out, setOut] = useState({ plan: '', actual: '', reason: '' });
  const [rows, setRows] = useState([]);
  const [override, setOverride] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const tolerance = pf?.variance_tolerance_pct ?? settings?.variance_tolerance_pct ?? 5;

  useEffect(() => {
    api.get('/plans?status=OPEN').then((a) => api.get('/plans?status=IN_PROGRESS').then((b) => setPlans([...b, ...a]))).catch(() => {});
  }, []);

  const loadPrefill = useCallback(async (plannedOutput) => {
    setError(null);
    if (source === 'PLAN' && !planId) { setPf(null); setRows([]); return; }
    if (source === 'AD_HOC' && (!productId || !locationId)) { setPf(null); setRows([]); return; }
    try {
      const p = await api.get(`/batches/prefill${qs({
        plan_id: source === 'PLAN' ? planId : '', product_id: source === 'AD_HOC' ? productId : '',
        location_id: source === 'AD_HOC' ? locationId : '', planned_output: plannedOutput,
      })}`, { scoped: false });
      setPf(p);
      setHead((h) => ({ ...h, mfg_date: h.mfg_date || p.mfg_date, expiry_date: h.expiry_date || p.expiry_date, warehouse_id: h.warehouse_id || p.warehouse_id || '' }));
      setOut((o) => ({ ...o, plan: String(p.planned_output), actual: o.actual === '' || plannedOutput === undefined ? String(p.planned_output) : o.actual }));
      setRows(p.lines.map((l) => ({
        key: `${l.material_id}`, material_id: l.material_id, material_code: l.material_code, material_name: l.material_name,
        uom: l.uom, lots: l.lots, inventory_id: l.suggested_inventory_id || '', plan_input_qty: l.plan_input_qty,
        actual_input_qty: String(l.plan_input_qty), variance_reason: '',
      })));
    } catch (e) { setError(e.message); setPf(null); setRows([]); }
  }, [source, planId, productId, locationId]);

  useEffect(() => { loadPrefill(undefined); }, [loadPrefill]);

  const outVar = variance(out.actual, out.plan);
  const outNeedsReason = Number(out.plan) > 0 && Math.abs(outVar.pct) > tolerance;
  const loc = locations.find((l) => l.id === (pf?.location_id || locationId));

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addLotRow = (i) => setRows((rs) => {
    const base = rs[i];
    const copy = { ...base, key: `${base.material_id}-${Date.now()}`, inventory_id: '', plan_input_qty: 0, actual_input_qty: '', variance_reason: '', extra: true };
    return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
  });
  const addMaterialRow = async (materialId) => {
    const m = allMaterials.find((x) => x.id === materialId);
    if (!m || !pf) return;
    const lots = await api.get(`/inventory/lots${qs({ material_id: materialId, location_id: pf.location_id })}`, { scoped: false });
    setRows((rs) => [...rs, { key: `${materialId}-${Date.now()}`, material_id: materialId, material_code: m.code, material_name: m.name,
      uom: m.uom, lots, inventory_id: lots[0]?.id || '', plan_input_qty: 0, actual_input_qty: '', variance_reason: '', extra: true }]);
  };

  // Aggregate variance per material (a material may be drawn from several lots)
  const perMaterial = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const a = m[r.material_id] || (m[r.material_id] = { plan: 0, actual: 0 });
      a.plan += Number(r.plan_input_qty || 0);
      a.actual += Number(r.actual_input_qty || 0);
    });
    return m;
  }, [rows]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const b = await api.post('/batches', {
        source, plan_id: source === 'PLAN' ? planId : undefined,
        product_id: source === 'AD_HOC' ? productId : undefined, location_id: source === 'AD_HOC' ? locationId : undefined,
        warehouse_id: head.warehouse_id || undefined, batch_no: head.batch_no, mfg_date: head.mfg_date, expiry_date: head.expiry_date,
        executed_by: head.executed_by, plan_output_qty: Number(out.plan || 0), actual_output_qty: Number(out.actual),
        variance_reason: out.reason, tolerance_override: override,
        inputs: rows.filter((r) => !(r.extra && !Number(r.actual_input_qty))).map((r) => ({
          material_id: r.material_id, inventory_id: r.inventory_id || undefined, plan_input_qty: Number(r.plan_input_qty || 0),
          actual_input_qty: Number(r.actual_input_qty || 0), variance_reason: r.variance_reason,
        })),
      });
      notify(`Batch ${b.batch_no} executed. Inventory updated.`);
      navigate(`/manufacturing/batches/${b.id}`);
    } catch (e) { setError(e.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Batch Entry" subtitle={`Manufacturing execution. On submit, raw material lots are deducted and the finished good lot is added in one transaction. Variance tolerance: ±${tolerance}%`} />
      <div className="p-5 space-y-4">
        <ErrorBox message={error} onClose={() => setError(null)} />

        <Section n={1} title="Batch Detail">
          <div className="grid grid-cols-6 gap-3">
            <Field label="Source" required>
              <select className="input" value={source} onChange={(e) => { setSource(e.target.value); setPf(null); setRows([]); }}>
                <option value="PLAN">Plan</option>
                <option value="AD_HOC">Ad Hoc</option>
              </select>
            </Field>
            {source === 'PLAN' ? (
              <Field label="Plan" required className="col-span-2">
                <select className="input" value={planId} onChange={(e) => { setPlanId(e.target.value); setOut({ plan: '', actual: '', reason: '' }); }}>
                  <option value="">Select open plan</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.plan_no} · {p.product_code} · {p.plan_mode === 'BATCHES'
                    ? `batch ${p.batch_count + 1} of ${p.planned_batches}` : `remaining ${fmtQty(p.remaining_qty)} ${p.output_uom}`}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Product" required className="col-span-2">
                  <Combobox value={productId} onChange={setProductId} options={materialOptions(products)} placeholder="Select product" />
                </Field>
                <Field label="Location" required>
                  <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="">Select</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label="Output Warehouse" required>
              <select className="input" value={head.warehouse_id} onChange={(e) => setHead({ ...head, warehouse_id: e.target.value })} disabled={!loc}>
                <option value="">Select</option>
                {(loc?.warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
            </Field>
            <Field label="Batch No" hint="Blank = auto number"><input className="input" value={head.batch_no} onChange={(e) => setHead({ ...head, batch_no: e.target.value })} /></Field>
            <Field label="Mfg Date" required><input className="input" type="date" value={head.mfg_date} onChange={(e) => setHead({ ...head, mfg_date: e.target.value })} /></Field>
            <Field label="Expiry Date" required><input className="input" type="date" value={head.expiry_date} onChange={(e) => setHead({ ...head, expiry_date: e.target.value })} /></Field>
            <Field label="Executed By" required><input className="input" value={head.executed_by} onChange={(e) => setHead({ ...head, executed_by: e.target.value })} /></Field>
          </div>
          {pf && (
            <div className="text-xs text-ink-muted mt-2">
              {pf.product.code} - {pf.product.name}
              {pf.bom ? ` · BOM ${pf.bom.bom_no} v${pf.bom.version} (expected output ${fmtQty(pf.bom.expected_output_qty)} ${pf.bom.output_uom} per batch)` : ' · No active BOM - add inputs manually'}
              {pf.plan ? (pf.plan.plan_mode === 'BATCHES'
                ? ` · Plan ${pf.plan.plan_no}: batch ${pf.plan.executed_batches + 1} of ${pf.plan.target_batches} (${pf.plan.executed_batches} done)`
                : ` · Plan target ${fmtQty(pf.plan.target_qty)}, executed ${fmtQty(pf.plan.executed_qty)}, remaining ${fmtQty(pf.plan.remaining_qty)}`) : ''}
            </div>
          )}
        </Section>

        <Section n={2} title="Output vs Plan">
          <div className="grid grid-cols-6 gap-3 items-end">
            <Field label={`Plan Output Qty${pf ? ` (${pf.product.uom})` : ''}`}>
              <input className="input num" type="number" min="0" step="any" value={out.plan}
                onChange={(e) => setOut({ ...out, plan: e.target.value })} onBlur={() => pf && loadPrefill(Number(out.plan || 0))} />
            </Field>
            <Field label="Actual Output Qty" required>
              <input className="input num" type="number" min="0" step="any" value={out.actual} onChange={(e) => setOut({ ...out, actual: e.target.value })} />
            </Field>
            <Field label="Variance (Qty)"><input className="input num" readOnly value={fmtQty(outVar.qty)} /></Field>
            <Field label="Variance %"><input className={`input num ${outNeedsReason ? 'text-danger' : ''}`} readOnly value={fmtPct(outVar.pct)} /></Field>
            <Field label="Reason for Variance" required={outNeedsReason} className="col-span-2">
              <input className={`input ${outNeedsReason && !out.reason ? 'border-danger' : ''}`} value={out.reason} onChange={(e) => setOut({ ...out, reason: e.target.value })} />
            </Field>
          </div>
          <div className="text-xs text-ink-muted mt-2">Changing the plan output recalculates the plan input of every material.</div>
        </Section>

        <Section n={3} title="Material Inputs (BOM) - Actual vs Plan">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Material</th><th className="th">Lot No (FEFO)</th><th className="th text-right">Plan Input</th>
                <th className="th text-right">Actual Input</th><th className="th">UOM</th><th className="th text-right">Variance</th>
                <th className="th text-right">Variance %</th><th className="th">Reason</th><th className="th w-16" />
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td className="td text-ink-muted" colSpan={9}>Select a plan or a product and location to load the BOM.</td></tr>}
                {rows.map((r, i) => {
                  const agg = perMaterial[r.material_id];
                  const v = variance(r.actual_input_qty, r.plan_input_qty);
                  const aggV = variance(agg.actual, agg.plan);
                  const needs = agg.plan > 0 && Math.abs(aggV.pct) > tolerance;
                  const lot = r.lots.find((x) => x.id === r.inventory_id);
                  const over = lot && Number(r.actual_input_qty) > Number(lot.quantity);
                  return (
                    <tr key={r.key}>
                      <td className="td whitespace-normal min-w-[200px]">{r.extra ? <span className="text-ink-muted">↳ </span> : ''}{r.material_code} - {r.material_name}</td>
                      <td className="td">
                        <select className={`input w-64 ${over ? 'border-danger' : ''}`} value={r.inventory_id} onChange={(e) => setRow(i, { inventory_id: e.target.value })}>
                          <option value="">{r.lots.length ? 'Select lot' : 'No stock at location'}</option>
                          {r.lots.map((x) => (
                            <option key={x.id} value={x.id}>{x.lot_no} · {x.warehouse_code} · {fmtQty(x.quantity)} · exp {fmtDate(x.expiry_date) || '-'}</option>
                          ))}
                        </select>
                        {over && <div className="text-xs2 text-danger">Only {fmtQty(lot.quantity)} in this lot</div>}
                      </td>
                      <td className="td num">{fmtQty(r.plan_input_qty)}</td>
                      <td className="td"><input className="input num w-28 ml-auto" type="number" min="0" step="any" value={r.actual_input_qty}
                        onChange={(e) => setRow(i, { actual_input_qty: e.target.value })} /></td>
                      <td className="td">{r.uom}</td>
                      <td className="td num">{fmtQty(v.qty)}</td>
                      <td className={`td num ${needs ? 'text-danger' : ''}`}>{fmtPct(aggV.pct)}</td>
                      <td className="td"><input className={`input w-48 ${needs && !rows.some((x) => x.material_id === r.material_id && x.variance_reason) ? 'border-danger' : ''}`}
                        value={r.variance_reason} onChange={(e) => setRow(i, { variance_reason: e.target.value })} placeholder={needs ? 'Required' : ''} /></td>
                      <td className="td">
                        <span className="flex gap-2">
                          <button type="button" className="btn-link" title="Consume from another lot too" onClick={() => addLotRow(i)}><Plus size={13} /></button>
                          {r.extra && <button type="button" className="btn-danger-link" title="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pf && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-ink-muted">Add material not in BOM:</span>
              <div className="w-80"><Combobox value="" onChange={addMaterialRow} options={materialOptions(allMaterials.filter((m) => m.id !== pf.product.id))} placeholder="Select material" /></div>
            </div>
          )}
        </Section>

        {canWrite && (
          <div className="flex items-center justify-end gap-4">
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-ink-soft">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override variance tolerance (Admin)
              </label>
            )}
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy || !pf || !(Number(out.actual) > 0)} onClick={submit}>Submit Batch</button>
          </div>
        )}
      </div>
    </div>
  );
}
