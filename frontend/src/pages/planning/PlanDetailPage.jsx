import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, Modal, PageHeader, Field } from '../../components/ui';
import PlanSummaries from './PlanSummaries';
import { PrintHeader, PrintPartsButton } from '../../components/print';
import { DetailGrid, Section } from '../../components/masterKit';

export default function PlanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, canWrite, notify } = useApp();
  const { data, loading, error, setData } = useData(() => api.get(`/plans/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState('');
  const [err, setErr] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;
  const { plan, planSummary: ps } = data;
  const open = ['OPEN', 'IN_PROGRESS'].includes(plan.status);
  const byBatches = plan.plan_mode === 'BATCHES';
  const eo = Number(ps.expected_output_per_batch);

  const patch = async (body, msg) => {
    setErr(null);
    try {
      setData(await api.patch(`/plans/${id}`, body));
      notify(msg);
      return true;
    } catch (e) { setErr(e.message); return false; }
  };
  const cancel = async () => {
    setErr(null);
    try { setData(await api.post(`/plans/${id}/cancel`)); notify('Plan cancelled'); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <PrintHeader title={`Production Plan ${plan.plan_no} - required stock`}
        filters={[['Product', `${plan.product_code} - ${plan.product_name}`], ['Location', `${plan.location_code} / ${plan.warehouse_code}`],
          ['BOM', `${plan.bom_no} v${plan.bom_version}`], ['Status', plan.status]]} />
      <PageHeader title={`Plan ${plan.plan_no}`}
        subtitle={`${plan.product_code} - ${plan.product_name} · ${plan.location_code} / ${plan.warehouse_code} · BOM ${plan.bom_no} v${plan.bom_version}`}
        actions={<>
          <Link className="btn-secondary" to="/planning/plans">Back</Link>
          <PrintPartsButton title={`Plan ${plan.plan_no}`} sections={[
            { key: 'details', label: 'Plan details' }, { key: 'summary', label: 'Plan summary' },
            { key: 'batches', label: 'Batch summary' }, { key: 'materials', label: 'Material summary (required stock)' },
            { key: 'history', label: 'History', on: false }]} />
          {canWrite && open && <button type="button" className="btn-secondary" onClick={cancel}>Cancel Plan</button>}
          {isAdmin && plan.status !== 'CANCELLED' && (
            <button type="button" className="btn-secondary" onClick={() => { setTarget(String(byBatches ? plan.target_batches : plan.target_qty)); setEditing(true); }}>
              {byBatches ? 'Edit Number of Batches' : 'Edit Target Qty'}
            </button>
          )}
          {canWrite && open && (
            <button type="button" className="btn-primary" onClick={() => navigate(`/manufacturing/new?plan_id=${plan.id}`)}>Execute Batch</button>
          )}
        </>} />
      <div className="p-5 space-y-4">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        <div data-print-section="details">
          <Section title="Plan details">
            <DetailGrid cols={4} items={[
              ['Plan', plan.plan_no], ['Product', `${plan.product_code} - ${plan.product_name}`, 'col-span-2'], ['Status', plan.status.replace('_', ' ')],
              ['Location / WH', `${plan.location_code} / ${plan.warehouse_code}`], ['BOM', `${plan.bom_no} v${plan.bom_version}`],
              ['Plan by', byBatches ? `${plan.target_batches} batches` : `Quantity ${fmtQty(plan.target_qty)} ${plan.output_uom}`],
              ['Required by', fmtDate(plan.required_date)], ['Created', fmtDateTime(plan.created_at)], ['Notes', plan.notes, 'col-span-3'],
            ]} />
          </Section>
        </div>
        <div className="flex items-center gap-6 text-[13px] no-print">
          <label className="flex items-center gap-1.5 text-ink-soft">
            <input type="checkbox" disabled={!canWrite || !open} checked={plan.apply_scrap_allowance}
              onChange={(e) => patch({ apply_scrap_allowance: e.target.checked }, 'Requirements recalculated')} />
            Include BOM scrap allowance
          </label>
        </div>
        <PlanSummaries {...data} applyScrap={plan.apply_scrap_allowance} locationId={plan.location_id} />

        {data.events.length > 0 && (
          <section className="card break-inside-avoid" data-print-section="history">
            <div className="px-4 py-2 border-b border-line bg-panel text-[13px] font-semibold text-ink">History</div>
            <table className="w-full">
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td className="td w-44">{fmtDateTime(e.created_at)}</td>
                    <td className="td w-40">{e.event.replace(/_/g, ' ')}</td>
                    <td className="td">
                      {['BATCH_EXECUTED', 'BATCH_CORRECTED', 'BATCH_REVERSED'].includes(e.event) && (
                        <>
                          {e.event === 'BATCH_EXECUTED' && `${e.new_value?.batch_no}: +${fmtQty(e.new_value?.output_qty)} ${e.new_value?.uom || ''}`}
                          {e.event === 'BATCH_CORRECTED' && `${e.new_value?.batch_no}: output ${fmtQty(e.old_value?.output_qty)} → ${fmtQty(e.new_value?.output_qty)}`}
                          {e.event === 'BATCH_REVERSED' && `${e.old_value?.batch_no}: -${fmtQty(e.old_value?.output_qty)} (${e.new_value?.reason})`}
                        </>
                      )}
                      {e.old_value?.target_qty !== undefined ? `Target ${fmtQty(e.old_value.target_qty)} → ${fmtQty(e.new_value?.target_qty)}` : ''}
                      {e.old_value?.target_batches !== undefined ? `Batches ${e.old_value.target_batches} → ${e.new_value?.target_batches}` : ''}
                      {e.event === 'CREATED' && e.new_value ? (e.new_value.target_batches ? `${e.new_value.target_batches} batches (${fmtQty(e.new_value.target_qty)})` : `Target ${fmtQty(e.new_value.target_qty)}`) : ''}
                    </td>
                    <td className="td w-48 text-ink-muted">{e.user_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {editing && (
        <Modal title={byBatches ? 'Edit Number of Batches' : 'Edit Target Plan Qty'} onClose={() => setEditing(false)}
          footer={<>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary"
              onClick={async () => {
                const body = byBatches ? { target_batches: Number(target) } : { target_qty: Number(target) };
                if (await patch(body, byBatches ? 'Batches updated - remaining and requirements recalculated' : 'Target updated - remaining and requirements recalculated')) setEditing(false);
              }}>
              Save
            </button>
          </>}>
          <ErrorBox message={err} onClose={() => setErr(null)} />
          {byBatches ? (
            <>
              <Field label="Number of batches" required hint={`Cannot be less than the ${ps.executed_batches} batch(es) already executed`}>
                <input className="input num" type="number" min={Math.max(ps.executed_batches, 1)} step="1" autoFocus value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} />
              </Field>
              <div className="text-[13px] text-ink-soft">
                Executed: {ps.executed_batches} · New remaining: <b>{Math.max(Number(target || 0) - ps.executed_batches, 0)} batch(es)</b>
                {' '}= {fmtQty(Math.max(Number(target || 0) - ps.executed_batches, 0) * eo)} {plan.output_uom}
              </div>
              <div className="text-xs text-ink-muted">Material requirements are re-exploded for the remaining batches and availability is re-checked instantly.</div>
            </>
          ) : (
            <>
              <Field label={`New Target Qty (${plan.output_uom})`} required>
                <input className="input num" type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
              </Field>
              <div className="text-[13px] text-ink-soft">
                Executed: {fmtQty(plan.executed_qty)} · New remaining: <b>{fmtQty(Math.max(Number(target || 0) - Number(plan.executed_qty), 0))}</b>
              </div>
              <div className="text-xs text-ink-muted">Material requirements are re-exploded for the remaining quantity and availability is re-checked instantly.</div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
