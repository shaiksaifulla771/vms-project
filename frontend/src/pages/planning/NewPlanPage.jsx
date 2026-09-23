import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { fmtQty } from '../../lib/format';
import { ErrorBox, Field, PageHeader } from '../../components/ui';
import { Combobox, materialOptions, useMaterials } from '../../components/pickers';
import PlanSummaries from './PlanSummaries';

export default function NewPlanPage() {
  const { locations, locationId, settings, canWrite, notify } = useApp();
  const navigate = useNavigate();
  const products = useMaterials({ producible: 'true', status: 'ACTIVE' });
  const [f, setF] = useState({ product_id: '', location_id: locationId || '', demand_qty: '', required_date: '', notes: '',
    apply_scrap_allowance: settings?.apply_scrap_allowance ?? true });
  const [sim, setSim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const simulate = async (next = f) => {
    setError(null);
    setSim(null);
    if (!next.product_id || !next.location_id || !(Number(next.demand_qty) > 0)) return;
    setBusy(true);
    try {
      setSim(await api.post('/plans/simulate', { ...next, demand_qty: Number(next.demand_qty) }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/plans', { product_id: f.product_id, location_id: f.location_id, target_qty: Number(f.demand_qty),
        apply_scrap_allowance: f.apply_scrap_allowance, required_date: f.required_date, notes: f.notes });
      notify(`Plan ${r.plan.plan_no} created`);
      navigate(`/planning/plans/${r.plan.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="New Plan" subtitle="Input: Product, Required Quantity (demand) and Location. The active BOM is exploded and checked against inventory at the location." />
      <div className="p-5 space-y-4">
        <div className="card p-4">
          <div className="grid grid-cols-6 gap-3 items-end">
            <Field label="Product" required className="col-span-2">
              <Combobox value={f.product_id} options={materialOptions(products)} placeholder="Select finished good"
                onChange={(v) => { const n = { ...f, product_id: v }; setF(n); simulate(n); }} />
            </Field>
            <Field label="Manufacturing Location" required>
              <select className="input" value={f.location_id} onChange={(e) => { const n = { ...f, location_id: e.target.value }; setF(n); simulate(n); }}>
                <option value="">Select</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
              </select>
            </Field>
            <Field label="Required Qty (Demand)" required>
              <input className="input num" type="number" min="0" step="any" value={f.demand_qty}
                onChange={(e) => setF({ ...f, demand_qty: e.target.value })} onBlur={() => simulate()} />
            </Field>
            <Field label="Required By">
              <input className="input" type="date" value={f.required_date} onChange={(e) => setF({ ...f, required_date: e.target.value })} />
            </Field>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => simulate()}>Calculate</button>
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-3">
            <label className="flex items-center gap-1.5 text-ink-soft">
              <input type="checkbox" checked={f.apply_scrap_allowance}
                onChange={(e) => { const n = { ...f, apply_scrap_allowance: e.target.checked }; setF(n); simulate(n); }} />
              Include BOM scrap allowance in requirements
            </label>
            <input className="input flex-1 min-w-[200px]" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
        </div>

        <ErrorBox message={error} onClose={() => setError(null)} />

        {sim && (
          <>
            <div className="text-xs text-ink-muted">
              BOM {sim.bom.bom_no} v{sim.bom.version} · Batch size {fmtQty(sim.bom.batch_size)} {sim.bom.batch_uom} ·
              Expected output {fmtQty(sim.bom.expected_output_qty)} {sim.bom.output_uom} per batch ·
              Batches = ceil({fmtQty(f.demand_qty)} / {fmtQty(sim.bom.expected_output_qty)}) = {sim.planSummary.remaining_batches}
            </div>
            <PlanSummaries {...sim} applyScrap={sim.apply_scrap_allowance} />
            {canWrite && (
              <div className="flex justify-end">
                <button type="button" className="btn-primary" disabled={busy} onClick={create}>Create Plan</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
