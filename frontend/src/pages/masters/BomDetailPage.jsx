import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, Printer, Scale, Star } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtDateTime, fmtQty } from '../../lib/format';
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

/** Copy into a separate BOM (side by side), optionally to another location, with its own name. */
function CopyDialog({ bom, onClose, onDone }) {
  const { locations } = useApp();
  const [name, setName] = useState(bom.name ? `${bom.name} (copy)` : '');
  const [loc, setLoc] = useState(bom.location_id);
  const [err, setErr] = useState(null);
  const save = async () => {
    try { onDone(await api.post(`/boms/${bom.id}/copy`, { name: name || null, location_id: loc })); } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={`Copy ${bom.bom_no} v${bom.version} to a new BOM`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Create draft</button></>}>
      <ErrorBox message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="New BOM name" hint="e.g. Economy pack"><input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Location">
          <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs text-ink-muted">The copy is a new draft. The current BOM stays active; both can be used once the copy is activated.</p>
    </Modal>
  );
}

function RenameDialog({ bom, onClose, onDone }) {
  const [name, setName] = useState(bom.name || '');
  const [err, setErr] = useState(null);
  const save = async () => { try { onDone(await api.post(`/boms/${bom.id}/rename`, { name: name || null })); } catch (e) { setErr(e.message); } };
  return (
    <Modal title="BOM name" onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} />
      <Field label="Name" hint="A label to tell BOMs of the same product apart"><input className="input" autoFocus maxLength={100} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></Field>
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
  const [copy, setCopy] = useState(false);
  const [rename, setRename] = useState(false);
  if (loading && !bom) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;

  const act = async (action, msg) => {
    setErr(null);
    try {
      const r = await api.post(`/boms/${id}/${action}`);
      notify(msg);
      if (r.id !== bom.id) navigate(`/masters/boms/${r.id}/edit`); else setData({ ...bom, ...r });
    } catch (e) { setErr(e.message); }
  };
  const c = bom.costing;

  return (
    <div>
      <PageHeader title={<span>{bom.bom_no} · v{bom.version}{bom.name ? ` · ${bom.name}` : ''}
        {bom.is_default && <span className="ml-2 align-middle text-xs2 px-1.5 py-0.5 rounded bg-accent-soft text-accent">Default</span>}</span>}
        subtitle={`${bom.product_code} - ${bom.product_name} · ${bom.location_code} / ${bom.warehouse_code}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <button type="button" className="btn-secondary no-print" onClick={() => window.print()}><Printer size={14} /> Print</button>
          {canWrite && <button type="button" className="btn-secondary" onClick={() => setRename(true)}>Rename</button>}
          {canWrite && bom.status === 'ACTIVE' && !bom.is_default && (
            <button type="button" className="btn-secondary" onClick={() => act('set-default', 'This BOM is now the Default')}><Star size={14} /> Set as Default</button>
          )}
          {canWrite && <button type="button" className="btn-secondary" onClick={() => setCopy(true)}><Copy size={14} /> Copy</button>}
          {canWrite && bom.status === 'DRAFT' && <Link className="btn-secondary" to={`/masters/boms/${bom.id}/edit`}>Edit</Link>}
          {canWrite && <button type="button" className="btn-secondary" onClick={() => setScale(true)}><Scale size={14} /> Scale Recipe</button>}
          {canWrite && <button type="button" className="btn-secondary" title="A new version replaces this BOM when activated"
            onClick={() => act('revise', 'New draft version created')}>New Version</button>}
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
                  <td className="td num" title={l.price_source === 'BOM' ? `Cost per unit of ${l.bom_cost_source}` : 'From the MPN'}>
                    {l.effective_price == null ? <span className="text-ink-faint">No price</span> : money(l.effective_price)}
                    {l.price_source === 'BOM' && <span className="text-ink-faint"> (BOM)</span>}</td>
                  <td className="td num">{money(l.line_cost)}</td>
                  <td className="td text-ink-soft whitespace-normal">{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="text-xs text-ink-faint">Line cost = qty × (1 + loss %) × price. Price comes from the MPN; a semi-finished ingredient made in-house uses the cost per unit of its own BOM (marked "BOM").</p>

        <div className="grid grid-cols-3 gap-4">
          <section className="card">
            <div className="px-3 py-2 border-b border-line text-[13px] font-medium">Plans using this BOM ({bom.used_in_plans?.length || 0})</div>
            <table className="w-full"><tbody>
              {(bom.used_in_plans || []).map((p) => (
                <tr key={p.id}><td className="td"><Link className="text-accent" to={`/planning/plans/${p.id}`}>{p.plan_no}</Link></td>
                  <td className="td num">{fmtQty(p.remaining_qty)} left</td><td className="td"><Status value={p.status} /></td></tr>
              ))}
              {!bom.used_in_plans?.length && <tr><td className="td text-ink-muted">Not used in any plan</td></tr>}
            </tbody></table>
          </section>
          <section className="card">
            <div className="px-3 py-2 border-b border-line text-[13px] font-medium">Batches made with it ({bom.used_in_batches?.length || 0})</div>
            <table className="w-full"><tbody>
              {(bom.used_in_batches || []).map((b) => (
                <tr key={b.id}><td className="td"><Link className="text-accent" to={`/manufacturing/batches/${b.id}`}>{b.batch_no}</Link></td>
                  <td className="td">{fmtDate(b.mfg_date)}</td><td className="td num">{fmtQty(b.actual_output_qty)} {b.output_uom}</td></tr>
              ))}
              {!bom.used_in_batches?.length && <tr><td className="td text-ink-muted">No batches yet</td></tr>}
            </tbody></table>
          </section>
          <section className="card">
            <div className="px-3 py-2 border-b border-line text-[13px] font-medium">Other BOMs of this product ({bom.other_boms?.length || 0})</div>
            <table className="w-full"><tbody>
              {(bom.other_boms || []).map((o) => (
                <tr key={o.id}><td className="td"><Link className="text-accent" to={`/masters/boms/${o.id}`}>{o.bom_no} v{o.version}</Link>
                  {o.name ? ` · ${o.name}` : ''}{o.is_default ? ' (Default)' : ''}</td>
                  <td className="td">{o.location_code}</td><td className="td"><Status value={o.status} /></td></tr>
              ))}
              {!bom.other_boms?.length && <tr><td className="td text-ink-muted">This is the only BOM</td></tr>}
            </tbody></table>
          </section>
        </div>
      </div>
      {copy && <CopyDialog bom={bom} onClose={() => setCopy(false)}
        onDone={(nb) => { setCopy(false); notify(`Copied to ${nb.bom_no} (draft)`); navigate(`/masters/boms/${nb.id}/edit`); }} />}
      {rename && <RenameDialog bom={bom} onClose={() => setRename(false)}
        onDone={(nb) => { setRename(false); notify('BOM name saved'); setData({ ...bom, ...nb }); }} />}
      {scale && <ScaleDialog bom={bom} onClose={() => setScale(false)}
        onDone={(nb) => { setScale(false); notify(`Scaled recipe saved as draft v${nb.version}`); navigate(`/masters/boms/${nb.id}`); }} />}
    </div>
  );
}
