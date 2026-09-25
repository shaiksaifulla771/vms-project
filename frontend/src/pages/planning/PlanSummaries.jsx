import { Link } from 'react-router-dom';
import { fmtDate, fmtQty } from '../../lib/format';
import { Status } from '../../components/ui';

function Section({ title, children, note }) {
  return (
    <section className="card">
      <div className="flex items-baseline justify-between px-3 py-2 border-b border-line">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {note && <span className="text-xs text-ink-muted">{note}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

/** The three spec summaries: Plan, Batch, Material */
export default function PlanSummaries({ planSummary: p, batchSummary, materialSummary, applyScrap }) {
  const shortCount = materialSummary.filter((m) => m.status === 'SHORT').length;
  return (
    <div className="space-y-4">
      <Section title="Plan Summary">
        <table className="w-full">
          <thead><tr>
            <th className="th">Product</th><th className="th">Plan ID</th><th className="th">Plan By</th>
            <th className="th text-right">Planned Batches</th><th className="th text-right">Executed Batches</th><th className="th text-right">Remaining Batches</th>
            <th className="th text-right">Target Qty</th><th className="th text-right">Executed Qty</th><th className="th text-right">Remaining Qty</th>
            <th className="th">Status</th>
          </tr></thead>
          <tbody><tr>
            <td className="td whitespace-normal min-w-[180px]">{p.product}</td>
            <td className="td">{p.plan_no || '(simulation)'}</td>
            <td className="td">{p.plan_mode === 'BATCHES' ? 'Batches' : 'Quantity'}</td>
            <td className={`td num ${p.plan_mode === 'BATCHES' ? 'font-semibold' : ''}`}>{p.target_batches ?? '-'}</td>
            <td className="td num">{p.executed_batches ?? 0}</td>
            <td className={`td num ${p.plan_mode === 'BATCHES' ? 'font-semibold' : ''}`}>{p.remaining_batches}</td>
            <td className="td num">{fmtQty(p.target_qty)} {p.uom}</td>
            <td className="td num">{fmtQty(p.executed_qty)} {p.uom}</td>
            <td className={`td num ${p.plan_mode === 'BATCHES' ? '' : 'font-semibold'}`}>{fmtQty(p.remaining_qty)} {p.uom}</td>
            <td className="td"><Status value={p.status} /></td>
          </tr></tbody>
        </table>
      </Section>

      <Section title="Batch Summary">
        <table className="w-full">
          <thead><tr>
            <th className="th w-12">#</th><th className="th">Product</th><th className="th">Batch No</th><th className="th">Mfg Date</th>
            <th className="th">Exp Date</th><th className="th text-right">Qty</th><th className="th">State</th>
          </tr></thead>
          <tbody>
            {batchSummary.length === 0 && <tr><td className="td text-ink-muted" colSpan={7}>No batches</td></tr>}
            {batchSummary.map((b) => (
              <tr key={b.index}>
                <td className="td">{b.index}</td>
                <td className="td">{p.product}</td>
                <td className="td">{b.batch_id ? <Link className="text-accent hover:underline" to={`/manufacturing/batches/${b.batch_id}`}>{b.batch_no}</Link> : <span className="text-ink-faint">assigned at execution</span>}</td>
                <td className="td">{fmtDate(b.mfg_date)}</td>
                <td className="td">{fmtDate(b.expiry_date)}</td>
                <td className="td num">{fmtQty(b.qty)} {p.uom}</td>
                <td className="td">{b.executed ? 'Executed' : 'Planned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Material Summary"
        note={`Requirement for the remaining ${p.plan_mode === 'BATCHES' ? `${p.remaining_batches} batch(es)` : 'quantity'}${applyScrap ? ', incl. scrap allowance' : ', without scrap allowance'} · ${shortCount ? `${shortCount} material(s) short` : 'all materials available'}`}>
        <table className="w-full">
          <thead><tr>
            <th className="th">Material (MPN)</th><th className="th">Vendor</th><th className="th text-right">Qty / Batch</th>
            <th className="th text-right">Scrap %</th><th className="th text-right">Qty Req</th><th className="th text-right">Qty Avail</th>
            <th className="th text-right">Short / Long</th><th className="th">UOM</th>
          </tr></thead>
          <tbody>
            {materialSummary.map((m) => (
              <tr key={m.material_id}>
                <td className="td whitespace-normal min-w-[260px]">{m.material_code} - {m.material_name}
                  {m.classification === 'SEMI_FINISHED' ? <span className="text-ink-muted"> (semi-finished)</span>
                    : (m.mpn_code ? <span className="text-ink-muted"> ({m.mpn_code})</span> : '')}
                  {m.make_first && <div className="text-xs text-danger">Make it first: <Link className="text-accent" to="/planning/new">plan {m.material_code}</Link></div>}
                </td>
                <td className="td whitespace-normal min-w-[140px]">{m.vendor_name || <span className="text-ink-faint">-</span>}</td>
                <td className="td num">{fmtQty(m.qty_per_batch)}</td>
                <td className="td num">{fmtQty(m.scrap_allowance_pct)}</td>
                <td className="td num">{fmtQty(m.qty_required)}</td>
                <td className="td num">{fmtQty(m.qty_available)}</td>
                <td className={`td num font-medium ${m.status === 'SHORT' ? 'text-danger' : ''}`}>
                  {m.short_long > 0 ? '+' : ''}{fmtQty(m.short_long)} {m.status === 'SHORT' ? 'Short' : 'Long'}
                </td>
                <td className="td">{m.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
