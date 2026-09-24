import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtDateTime, fmtPct, fmtQty, mpnLabel } from '../../lib/format';
import { ErrorBox, Field, Loading, Modal, PageHeader } from '../../components/ui';

const r4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;

export default function BatchDetailPage() {
  const { id } = useParams();
  const { canWrite, isAdmin, settings, notify } = useApp();
  const { data: b, loading, error, setData } = useData(() => api.get(`/batches/${id}`), [id]);
  const ledger = useData(() => (b ? api.get(`/inventory/ledger?reference_id=${encodeURIComponent(b.batch_no)}`, { scoped: false }) : Promise.resolve([])), [b?.batch_no]);
  const [edit, setEdit] = useState(null);
  const [override, setOverride] = useState(false);
  const [err, setErr] = useState(null);
  const [reversing, setReversing] = useState(null);   // reason text while the dialog is open
  const tolerance = settings?.variance_tolerance_pct ?? 5;

  if (loading && !b) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;

  const startEdit = () => setEdit({
    actual_output_qty: String(b.actual_output_qty), variance_reason: b.variance_reason || '',
    inputs: b.inputs.map((i) => ({ id: i.id, actual_input_qty: String(i.actual_input_qty), variance_reason: i.variance_reason || '' })),
  });

  const save = async () => {
    setErr(null);
    try {
      const nb = await api.put(`/batches/${id}`, {
        actual_output_qty: Number(edit.actual_output_qty), variance_reason: edit.variance_reason, tolerance_override: override,
        inputs: edit.inputs.filter((x, i) => Number(x.actual_input_qty) !== Number(b.inputs[i].actual_input_qty) || x.variance_reason !== (b.inputs[i].variance_reason || ''))
          .map((x) => ({ id: x.id, actual_input_qty: Number(x.actual_input_qty), variance_reason: x.variance_reason })),
      });
      setData(nb);
      setEdit(null);
      ledger.reload();
      notify('Batch updated. Inventory adjusted by the difference.');
    } catch (e) { setErr(e.message); }
  };

  const reverse = async () => {
    setErr(null);
    try {
      setData(await api.post(`/batches/${id}/reverse`, { reason: reversing }));
      setReversing(null);
      ledger.reload();
      notify('Batch reversed: output removed, materials returned, plan updated');
    } catch (e) { setErr(e.message); setReversing(null); }
  };
  const reversed = b.status === 'REVERSED';

  const outDelta = edit ? r4(Number(edit.actual_output_qty) - Number(b.actual_output_qty)) : 0;

  return (
    <div>
      <PageHeader title={`Batch ${b.batch_no}`}
        subtitle={`${b.product_code} - ${b.product_name} · ${b.location_code} / ${b.warehouse_code} · ${b.source === 'PLAN' ? `Plan ${b.plan_no}` : 'Ad Hoc'}`}
        actions={<>
          <Link className="btn-secondary" to="/manufacturing/batches">Back</Link>
          {b.plan_id && <Link className="btn-secondary" to={`/planning/plans/${b.plan_id}`}>Open Plan</Link>}
          <Link className="btn-secondary" to={`/reports/traceability?mpn_id=${b.output_mpn_id}&lot_no=${encodeURIComponent(b.batch_no)}`}>Trace Lot</Link>
          {isAdmin && !edit && !reversed && <button type="button" className="btn-secondary" onClick={() => setReversing('')}>Reverse Batch</button>}
          {canWrite && !edit && !reversed && <button type="button" className="btn-primary" onClick={startEdit}>Edit IP / OP</button>}
        </>} />
      <div className="p-5 space-y-4">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        {reversed && (
          <div className="border border-line-strong rounded px-3 py-2 text-[13px] bg-panel">
            <b>Reversed</b> on {fmtDateTime(b.reversed_at)}: {b.reversal_reason}. Its output was removed from stock, the materials were
            returned to their lots, and the plan no longer counts it.
          </div>
        )}

        <section className="card">
          <div className="px-3 py-2 border-b border-line text-[13px] font-semibold">Section 1: Batch Detail</div>
          <div className="grid grid-cols-4 gap-x-6 gap-y-2 p-3 text-[13px]">
            {[
              ['Source', b.source === 'PLAN' ? 'Plan' : 'Ad Hoc'], ['Product', `${b.product_code} - ${b.product_name}`],
              ['Batch No / FG Lot', b.batch_no], ['Made', 'In-house (no MPN)'],
              ['Mfg Date', fmtDate(b.mfg_date)], ['Expiry Date', fmtDate(b.expiry_date)],
              ['Executed By', b.executed_by], ['BOM', b.bom_no ? `${b.bom_no} v${b.bom_version}` : '-'],
            ].map(([k, v]) => <div key={k}><div className="text-xs text-ink-muted">{k}</div><div>{v}</div></div>)}
          </div>
        </section>

        <section className="card">
          <div className="px-3 py-2 border-b border-line text-[13px] font-semibold">Section 2: Output vs Plan</div>
          <table className="w-full">
            <thead><tr><th className="th text-right">Plan Output</th><th className="th text-right">Actual Output</th><th className="th text-right">Variance</th><th className="th text-right">Variance %</th><th className="th">Reason for Variance</th></tr></thead>
            <tbody><tr>
              <td className="td num">{fmtQty(b.plan_output_qty)} {b.output_uom}</td>
              <td className="td num">
                {edit ? <input className="input num w-32 ml-auto" type="number" min="0" step="any" value={edit.actual_output_qty} onChange={(e) => setEdit({ ...edit, actual_output_qty: e.target.value })} />
                  : `${fmtQty(b.actual_output_qty)} ${b.output_uom}`}
                {edit && outDelta !== 0 && <div className="text-xs2 text-ink-muted">Inventory {outDelta > 0 ? '+' : ''}{fmtQty(outDelta)}</div>}
              </td>
              <td className="td num">{fmtQty(b.variance_qty)}</td>
              <td className={`td num ${Math.abs(b.variance_pct) > tolerance ? 'text-danger' : ''}`}>{fmtPct(b.variance_pct)}</td>
              <td className="td">{edit ? <input className="input" value={edit.variance_reason} onChange={(e) => setEdit({ ...edit, variance_reason: e.target.value })} /> : (b.variance_reason || '-')}
                {b.tolerance_override && <span className="text-xs text-ink-muted"> (tolerance overridden by Admin)</span>}</td>
            </tr></tbody>
          </table>
        </section>

        <section className="card">
          <div className="px-3 py-2 border-b border-line text-[13px] font-semibold">Section 3: Material Inputs - Actual vs Plan</div>
          <table className="w-full">
            <thead><tr>
              <th className="th">Material</th><th className="th">MPN</th><th className="th">Lot No</th><th className="th">WH</th>
              <th className="th text-right">Plan Input</th><th className="th text-right">Actual Input</th><th className="th">UOM</th>
              <th className="th text-right">Variance</th><th className="th text-right">Variance %</th><th className="th">Reason</th>
            </tr></thead>
            <tbody>
              {b.inputs.map((i, idx) => {
                const d = edit ? r4(Number(edit.inputs[idx].actual_input_qty) - Number(i.actual_input_qty)) : 0;
                return (
                  <tr key={i.id}>
                    <td className="td">{i.material_code} - {i.material_name}</td>
                    <td className="td">{i.mpn_code || '-'}</td>
                    <td className="td">{i.lot_no || '-'}</td>
                    <td className="td">{i.warehouse_code || '-'}</td>
                    <td className="td num">{fmtQty(i.plan_input_qty)}</td>
                    <td className="td num">
                      {edit ? <input className="input num w-28 ml-auto" type="number" min="0" step="any" disabled={!i.lot_no}
                        value={edit.inputs[idx].actual_input_qty}
                        onChange={(e) => setEdit({ ...edit, inputs: edit.inputs.map((x, j) => (j === idx ? { ...x, actual_input_qty: e.target.value } : x)) })} />
                        : fmtQty(i.actual_input_qty)}
                      {edit && d !== 0 && <div className="text-xs2 text-ink-muted">Lot {d > 0 ? '-' : '+'}{fmtQty(Math.abs(d))}</div>}
                    </td>
                    <td className="td">{i.uom}</td>
                    <td className="td num">{fmtQty(i.variance_qty)}</td>
                    <td className={`td num ${Math.abs(i.variance_pct) > tolerance ? 'text-danger' : ''}`}>{fmtPct(i.variance_pct)}</td>
                    <td className="td">{edit ? <input className="input" value={edit.inputs[idx].variance_reason}
                      onChange={(e) => setEdit({ ...edit, inputs: edit.inputs.map((x, j) => (j === idx ? { ...x, variance_reason: e.target.value } : x)) })} />
                      : (i.variance_reason || '-')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {edit && (
          <div className="flex items-center justify-end gap-4">
            {isAdmin && <label className="flex items-center gap-1.5 text-ink-soft"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override variance tolerance</label>}
            <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={save}>Save Changes</button>
          </div>
        )}

        <section className="card">
          <div className="px-3 py-2 border-b border-line text-[13px] font-semibold">Inventory Postings (Audit Ledger)</div>
          <table className="w-full">
            <thead><tr><th className="th">Txn</th><th className="th">Time</th><th className="th">Type</th><th className="th">MPN</th><th className="th">Lot</th><th className="th">WH</th><th className="th text-right">Qty Change</th><th className="th text-right">New Balance</th><th className="th">User</th></tr></thead>
            <tbody>
              {(ledger.data || []).map((l) => (
                <tr key={l.id}>
                  <td className="td">{l.txn_no}</td><td className="td">{fmtDateTime(l.txn_at)}</td><td className="td">{l.txn_type.replace(/_/g, ' ')}</td>
                  <td className="td">{mpnLabel(l.mpn_code, l.classification)}</td><td className="td">{l.lot_no}</td><td className="td">{l.warehouse_code}</td>
                  <td className="td num">{l.qty_change > 0 ? '+' : ''}{fmtQty(l.qty_change)}</td><td className="td num">{fmtQty(l.new_balance)}</td>
                  <td className="td">{l.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {reversing !== null && (
        <Modal title={`Reverse batch ${b.batch_no}`} onClose={() => setReversing(null)}
          footer={<><button type="button" className="btn-secondary" onClick={() => setReversing(null)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!reversing.trim()} onClick={reverse}>Reverse Batch</button></>}>
          <p className="text-[13px]">This removes the {fmtQty(b.actual_output_qty)} {b.output_uom} produced from lot {b.batch_no}, returns every material to
            the lot it came from, and takes the batch off its plan. The batch stays on record as Reversed.</p>
          <Field label="Reason" required><input className="input" autoFocus value={reversing} onChange={(e) => setReversing(e.target.value)} placeholder="e.g. Entered on the wrong plan" /></Field>
        </Modal>
      )}
    </div>
  );
}
