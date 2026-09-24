import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Field, Loading, Modal, PageHeader, Status } from '../../components/ui';

const money = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Scale recipe: enter a new batch size, preview every quantity, save as a new DRAFT version. */
function ScaleDialog({ bom, onClose, onDone }) {
  const [size, setSize] = useState('');
  const [prev, setPrev] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = async () => {
    setErr(null); setPrev(null);
    try { setPrev(await api.post(`/boms/${bom.id}/scale`, { batch_size: Number(size), preview: true })); } catch (e) { setErr(e.message); }
  };
  const save = async () => {
    setBusy(true);
    try { onDone(await api.post(`/boms/${bom.id}/scale`, { batch_size: Number(size) })); } catch (e) { setErr(e.message); setBusy(false); }
  };
  const COST_LABEL = { packing_cost: 'Packing', processing_cost: 'Processing', overhead_cost: 'Overhead', freight_cost: 'Freight' };
  return (
    <Modal title={`Scale recipe - ${bom.bom_no} v${bom.version}`} onClose={onClose} width="max-w-3xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!prev || busy} onClick={save}>Save as new draft version</button></>}>
      <ErrorBox message={err} />
      <div className="flex items-end gap-3">
        <Field label="Current batch size"><input className="input num w-36" value={`${fmtQty(bom.batch_size)} ${bom.batch_uom}`} disabled /></Field>
        <Field label={`New batch size (${bom.batch_uom})`} required>
          <input className="input num w-36" type="number" min="0" step="any" autoFocus value={size}
            onChange={(e) => { setSize(e.target.value); setPrev(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && size) preview(); }} />
        </Field>
        <button type="button" className="btn-secondary" disabled={!size} onClick={preview}>Preview</button>
        {prev && <span className="text-[13px] text-ink-muted pb-1.5">Factor × {prev.factor}</span>}
      </div>
      {prev && (
        <div className="space-y-3">
          <table className="w-full border border-line border-collapse">
            <thead><tr><th className="th">Ingredient</th><th className="th text-right">Current qty</th><th className="th text-right">New qty</th><th className="th">UOM</th></tr></thead>
            <tbody>
              {prev.lines.map((l) => (
                <tr key={l.line_no}><td className="td whitespace-normal">{l.material_code} - {l.material_name}</td><td className="td num">{fmtQty(l.from, 4)}</td>
                  <td className="td num font-medium">{fmtQty(l.to, 4)}</td><td className="td">{l.uom}</td></tr>
              ))}
              <tr className="bg-panel"><td className="td font-medium">Expected output</td><td className="td num">{fmtQty(prev.from.expected_output_qty, 4)}</td>
                <td className="td num font-medium">{fmtQty(prev.to.expected_output_qty, 4)}</td><td className="td">{bom.output_uom}</td></tr>
            </tbody>
          </table>
          <div className="grid grid-cols-4 gap-3 text-[13px]">
            {Object.entries(prev.costs).map(([k, c]) => (
              <div key={k}><div className="text-xs text-ink-muted">{COST_LABEL[k]} cost</div>₹ {money(c.from)} → <b>₹ {money(c.to)}</b></div>
            ))}
          </div>
          <p className="text-xs text-ink-muted">Loss %, MPNs and price overrides are copied as they are. The current BOM is not changed; activate the new version when ready.</p>
        </div>
      )}
    </Modal>
  );
}

export default function BomDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite, notify } = useApp();
  const { data: bom, loading, error, setData } = useData(() => api.get(`/boms/${id}`), [id]);
  const [err, setErr] = useState(null);
  const [scale, setScale] = useState(false);
  if (loading && !bom) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;

  const act = async (action, msg) => {
    setErr(null);
    try {
      const r = await api.post(`/boms/${id}/${action}`);
      notify(msg);
      if (r.id !== bom.id) navigate(`/masters/boms/${r.id}/edit`); else setData(r);
    } catch (e) { setErr(e.message); }
  };
  const c = bom.costing;

  return (
    <div>
      <PageHeader title={`${bom.bom_no} · v${bom.version}`} subtitle={`${bom.product_code} - ${bom.product_name} · ${bom.location_code} / ${bom.warehouse_code}`}
        actions={<>
          <Link className="btn-secondary" to="/masters/boms">Back</Link>
          {canWrite && bom.status === 'DRAFT' && <Link className="btn-secondary" to={`/masters/boms/${bom.id}/edit`}>Edit</Link>}
          {canWrite && <button type="button" className="btn-secondary" onClick={() => setScale(true)}><Scale size={14} /> Scale Recipe</button>}
          {canWrite && <button type="button" className="btn-secondary" onClick={() => act('revise', 'New draft version created')}>New Version</button>}
          {canWrite && bom.status === 'ACTIVE' && <button type="button" className="btn-secondary" onClick={() => act('obsolete', 'BOM marked obsolete')}>Mark Obsolete</button>}
          {canWrite && bom.status === 'DRAFT' && <button type="button" className="btn-primary" onClick={() => act('activate', 'BOM activated')}>Activate</button>}
        </>} />
      <div className="p-5 space-y-4">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        <section className="card grid grid-cols-6 gap-x-6 gap-y-2 p-3 text-[13px]">
          {[
            ['Status', <Status key="s" value={bom.status} />], ['Batch Size', `${fmtQty(bom.batch_size)} ${bom.batch_uom}`],
            ['Expected Output', `${fmtQty(bom.expected_output_qty)} ${bom.output_uom}`], ['Location', bom.location_name],
            ['Warehouse', bom.warehouse_name], ['Updated', fmtDateTime(bom.updated_at)],
          ].map(([k, v]) => <div key={k}><div className="text-xs text-ink-muted">{k}</div><div>{v}</div></div>)}
          {bom.notes && <div className="col-span-6 text-ink-muted whitespace-pre-line">{bom.notes}</div>}
        </section>

        <section className="card grid grid-cols-7 gap-x-6 p-3 text-[13px]">
          {[
            ['Material cost', c.material_cost], ['Packing', c.packing_cost], ['Processing', c.processing_cost],
            ['Overhead', c.overhead_cost], ['Freight', c.freight_cost],
          ].map(([k, v]) => <div key={k}><div className="text-xs text-ink-muted">{k}</div><div className="tabular-nums">₹ {money(v)}</div></div>)}
          <div className="border-l border-line pl-4"><div className="text-xs text-ink-muted">Total per batch</div><div className="tabular-nums font-semibold">₹ {money(c.total_batch_cost)}</div></div>
          <div><div className="text-xs text-ink-muted">Cost per {bom.output_uom}</div><div className="tabular-nums font-semibold">{c.cost_per_output_unit == null ? '-' : `₹ ${Number(c.cost_per_output_unit).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`}</div></div>
          {c.unpriced_lines > 0 && <div className="col-span-7 text-xs text-ink-muted mt-1">{c.unpriced_lines} ingredient{c.unpriced_lines > 1 ? 's have' : ' has'} no price yet (set it on the MPN, or override it on the BOM line), so material cost is understated.</div>}
        </section>

        <section className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th w-12">#</th><th className="th">Ingredient</th><th className="th">MPN</th><th className="th">Vendor</th>
              <th className="th text-right">Qty per Batch</th><th className="th">UOM</th><th className="th text-right">Loss %</th>
              <th className="th text-right">Price (₹)</th><th className="th text-right">Line Cost (₹)</th><th className="th">Notes</th>
            </tr></thead>
            <tbody>
              {bom.lines.map((l) => (
                <tr key={l.id}>
                  <td className="td">{l.line_no}</td>
                  <td className="td whitespace-normal min-w-[200px]">{l.material_code} - {l.material_name}</td>
                  <td className="td">{l.mpn_code || <span className="text-ink-faint">any</span>}</td>
                  <td className="td">{l.vendor_name || '-'}</td>
                  <td className="td num">{fmtQty(l.qty_per_batch, 4)}</td>
                  <td className="td">{l.uom}</td>
                  <td className="td num">{fmtQty(l.scrap_allowance_pct)}</td>
                  <td className="td num" title="From the MPN">{l.effective_price == null ? <span className="text-ink-faint">No price</span> : money(l.effective_price)}</td>
                  <td className="td num">{money(l.line_cost)}</td>
                  <td className="td text-ink-soft whitespace-normal">{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="text-xs text-ink-faint">* price overridden on this BOM. Line cost = qty × (1 + loss %) × price.</p>
      </div>
      {scale && <ScaleDialog bom={bom} onClose={() => setScale(false)}
        onDone={(nb) => { setScale(false); notify(`Scaled recipe saved as draft v${nb.version}`); navigate(`/masters/boms/${nb.id}`); }} />}
    </div>
  );
}
