import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { TXN_LABEL, fmtDate, fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, PageHeader } from '../../components/ui';

function Backward({ batches, depth = 0 }) {
  if (!batches?.length) return depth === 0 ? <div className="text-ink-muted">Not produced in-house (no batch created this lot).</div> : null;
  return (
    <ul className={depth ? 'ml-6 border-l border-line pl-3' : ''}>
      {batches.map((b) => (
        <li key={b.id} className="py-1">
          <div>
            Batch <Link className="text-accent hover:underline" to={`/manufacturing/batches/${b.id}`}>{b.batch_no}</Link>
            <span className="text-ink-muted"> · {b.location_code}/{b.warehouse_code} · Mfg {fmtDate(b.mfg_date)} · Output {fmtQty(b.actual_output_qty)} {b.output_uom}{b.plan_no ? ` · Plan ${b.plan_no}` : ' · Ad Hoc'}</span>
          </div>
          <ul className="ml-6 border-l border-line pl-3">
            {b.inputs.map((i) => (
              <li key={`${i.mpn_id}-${i.lot_no}`} className="py-0.5">
                consumed {fmtQty(i.actual_input_qty)} {i.uom} of {i.material_code} - {i.material_name}, MPN {i.mpn_code}, Lot{' '}
                <Link className="text-accent hover:underline" to={`/reports/traceability?mpn_id=${i.mpn_id}&lot_no=${encodeURIComponent(i.lot_no)}`}>{i.lot_no}</Link>
                <span className="text-ink-muted"> ({i.warehouse_code})</span>
                <Backward batches={i.sources} depth={depth + 1} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Forward({ rows, depth = 0 }) {
  if (!rows?.length) return depth === 0 ? <div className="text-ink-muted">Not consumed in any batch.</div> : null;
  return (
    <ul className={depth ? 'ml-6 border-l border-line pl-3' : ''}>
      {rows.map((r) => (
        <li key={r.id} className="py-1">
          {fmtQty(r.consumed_qty)} {r.consumed_uom} used in batch{' '}
          <Link className="text-accent hover:underline" to={`/manufacturing/batches/${r.id}`}>{r.batch_no}</Link>
          <span className="text-ink-muted"> → {r.product_code} - {r.product_name}, lot{' '}</span>
          <Link className="text-accent hover:underline" to={`/reports/traceability?mpn_id=${r.output_mpn_id}&lot_no=${encodeURIComponent(r.batch_no)}`}>{r.batch_no}</Link>
          <span className="text-ink-muted"> ({fmtQty(r.actual_output_qty)} {r.output_uom}, {r.location_code}, Mfg {fmtDate(r.mfg_date)})</span>
          <Forward rows={r.used_in} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

export default function TraceabilityPage() {
  const [params, setParams] = useSearchParams();
  const mpnId = params.get('mpn_id');
  const lotNo = params.get('lot_no');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setTrace(null);
    if (!mpnId || !lotNo) return;
    api.get(`/reports/trace${qs({ mpn_id: mpnId, lot_no: lotNo })}`, { scoped: false }).then(setTrace).catch((e) => setError(e.message));
  }, [mpnId, lotNo]);

  const search = async (e) => {
    e.preventDefault();
    setError(null);
    try { setHits(await api.get(`/reports/lots${qs({ q })}`, { scoped: false })); } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <PageHeader title="Traceability" subtitle="Backward: finished good lot → batch → raw material lots. Forward: raw material lot → batches → finished good lots." />
      <div className="p-5 space-y-4">
        <form onSubmit={search} className="flex gap-2">
          <input className="input w-96" placeholder="Search lot no, MPN or material" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn-primary">Search</button>
        </form>
        <ErrorBox message={error} onClose={() => setError(null)} />
        {hits.length > 0 && (
          <div className="card max-h-60 overflow-y-auto">
            <table className="w-full">
              <thead><tr><th className="th">Lot No</th><th className="th">MPN</th><th className="th">Material</th><th className="th">Classification</th></tr></thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={`${h.mpn_id}-${h.lot_no}`} className="cursor-pointer hover:bg-accent-soft"
                    onClick={() => { setHits([]); setParams({ mpn_id: h.mpn_id, lot_no: h.lot_no }); }}>
                    <td className="td">{h.lot_no}</td><td className="td">{h.mpn_code}</td><td className="td">{h.material_code} - {h.material_name}</td>
                    <td className="td">{h.classification.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {trace && (
          <>
            <div className="card px-3 py-2">
              <span className="font-semibold">Lot {trace.lot.lot_no}</span> · {trace.lot.material_code} - {trace.lot.material_name} · MPN {trace.lot.mpn_code}
              <span className="text-ink-muted"> · On hand now: {fmtQty(trace.lot.on_hand || 0)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <section className="card p-3">
                <h3 className="font-semibold mb-2">Backward trace (made from)</h3>
                <Backward batches={trace.backward} />
              </section>
              <section className="card p-3">
                <h3 className="font-semibold mb-2">Forward trace (used in)</h3>
                <Forward rows={trace.forward} />
              </section>
            </div>
            <section className="card">
              <div className="px-3 py-2 border-b border-line font-semibold">Lot movements</div>
              <table className="w-full">
                <thead><tr><th className="th">Txn</th><th className="th">Time</th><th className="th">Type</th><th className="th">Location / WH</th><th className="th text-right">Qty Change</th><th className="th text-right">Balance</th><th className="th">Reference</th><th className="th">User</th></tr></thead>
                <tbody>
                  {trace.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="td">{m.txn_no}</td><td className="td">{fmtDateTime(m.txn_at)}</td><td className="td">{TXN_LABEL[m.txn_type]}</td>
                      <td className="td">{m.location_code} / {m.warehouse_code}</td>
                      <td className="td num">{m.qty_change > 0 ? '+' : ''}{fmtQty(m.qty_change)}</td><td className="td num">{fmtQty(m.new_balance)}</td>
                      <td className="td">{[m.reference_type, m.reference_id].filter(Boolean).join(' ')}</td><td className="td">{m.user_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
