import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Field, Loading, Modal, PageHeader, Stat, Status } from '../../components/ui';

const num = (x) => (x === '' || x === null || x === undefined ? null : Number(x));

export default function StockCountPage() {
  const { id } = useParams();
  const { canWrite, isAdmin, company, notify } = useApp();
  const [count, setCount] = useState(null);
  const [edits, setEdits] = useState({});          // lineId -> { counted_qty, reason_code, reason_note }
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState('all');
  const [dialog, setDialog] = useState(null);      // { type: 'return' }
  const [comment, setComment] = useState('');
  const [countedAt, setCountedAt] = useState('');  // optional: when the shelf was counted (paper sheet typed in later)

  const load = async () => {
    try { setCount(await api.get(`/stock-counts/${id}`)); setEdits({}); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => (count?.lines || []).map((l) => {
    const e = edits[l.id] || {};
    const counted = 'counted_qty' in e ? num(e.counted_qty) : num(l.counted_qty);
    // Compare with the system stock at the time of counting: saved lines -> book_qty; new entries -> stock now.
    const changed = 'counted_qty' in e && num(e.counted_qty) !== num(l.counted_qty);
    const expected = l.book_qty === null ? null : Number(l.counted_at && !changed ? l.book_qty : l.current_qty);
    const variance = counted === null || expected === null ? null : Math.round((counted - expected) * 10000) / 10000;
    return {
      ...l, counted, variance, expected,
      reason_code: 'reason_code' in e ? e.reason_code : (l.reason_code || ''),
      reason_note: 'reason_note' in e ? e.reason_note : (l.reason_note || ''),
      inputValue: 'counted_qty' in e ? e.counted_qty : (l.counted_qty ?? ''),
    };
  }), [count, edits]);

  if (!count) return <><PageHeader title="Stock Count" /><div className="p-5"><ErrorBox message={err} />{!err && <Loading />}</div></>;

  const hidden = count.system_qty_hidden;
  const editable = canWrite && ['DRAFT', 'COUNTING'].includes(count.status);
  const reasonsEditable = editable || (isAdmin && count.status === 'SUBMITTED');
  const dirty = Object.keys(edits).length > 0;
  const setLine = (lineId, patch) => setEdits((s) => ({ ...s, [lineId]: { ...(s[lineId] || {}), ...patch } }));
  const needsReason = (l) => l.variance !== null && l.variance !== 0 && (!l.reason_code || (l.reason_code === 'OTHER' && !l.reason_note));

  const shown = lines.filter((l) => (show === 'uncounted' ? l.counted === null
    : show === 'variance' ? (l.variance !== null && l.variance !== 0) : true));
  const stats = {
    counted: lines.filter((l) => l.counted !== null).length,
    diff: hidden ? null : lines.filter((l) => l.variance).length,
    plus: hidden ? null : lines.reduce((a, l) => a + (l.variance > 0 ? l.variance : 0), 0),
    minus: hidden ? null : lines.reduce((a, l) => a + (l.variance < 0 ? l.variance : 0), 0),
    missing: lines.filter(needsReason).length,
  };

  const save = async (quiet) => {
    if (!dirty) return true;
    setErr(null); setBusy(true);
    try {
      const payload = Object.keys(edits).map((lineId) => {
        const l = lines.find((x) => x.id === lineId);
        return { id: lineId, counted_qty: l.counted, reason_code: l.reason_code || null, reason_note: l.reason_note || null };
      });
      const at = countedAt ? new Date(countedAt).toISOString() : undefined;
      setCount(await api.put(`/stock-counts/${id}/lines`, { lines: payload, counted_at: at }));
      setEdits({});
      if (!quiet) notify('Counts saved - stock is not changed until approval');
      return true;
    } catch (e) { setErr(e.message); return false; } finally { setBusy(false); }
  };
  const act = async (path, body, msg) => {
    setErr(null); setBusy(true);
    try {
      const r = await api.post(`/stock-counts/${id}/${path}`, body);
      setCount(r); setEdits({}); notify(msg); setDialog(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const addLots = async () => {
    if (!(await save(true))) return;
    setErr(null); setBusy(true);
    try {
      const r = await api.post(`/stock-counts/${id}/add-lots`, {});
      setCount(r); setEdits({});
      notify(r.added_lines ? `${r.added_lines} lot(s) received after the start were added` : 'No new lots - the sheet is complete');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const submit = async () => { if (await save(true)) await act('submit', {}, 'Submitted for approval'); };
  const approve = async () => { if (await save(true)) await act('approve', {}, 'Count approved - adjustments posted to stock'); };
  const onEnter = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.querySelector(`[data-count-row="${idx + 1}"]`);
    if (next) next.focus();
  };

  return (
    <div>
      <PageHeader title={`${count.count_no} · Physical Stock Count`}
        subtitle={<Link to="/inventory/stock-counts" className="inline-flex items-center gap-1 hover:text-accent"><ChevronLeft size={12} /> All counts</Link>}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer size={14} /> {count.status === 'POSTED' ? 'Print result' : 'Print count sheet'}</button>
          {editable && <button type="button" className="btn-secondary" disabled={busy} onClick={addLots} title="Add lots of this area that were received after the count started">Add new lots</button>}
          {editable && <button type="button" className="btn-secondary" disabled={busy || !dirty} onClick={() => save()}>Save counts</button>}
          {canWrite && ['DRAFT', 'COUNTING', 'SUBMITTED'].includes(count.status) && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => act('cancel', {}, 'Count cancelled')}>Cancel count</button>
          )}
          {editable && <button type="button" className="btn-primary" disabled={busy || stats.counted === 0} onClick={submit}>Submit for approval</button>}
          {isAdmin && count.status === 'SUBMITTED' && <>
            {dirty && <button type="button" className="btn-secondary" disabled={busy} onClick={() => save()}>Save reasons</button>}
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setComment(''); setDialog({ type: 'return' }); }}>Send back</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={approve}>Approve & post</button>
          </>}
        </>} />

      <div className="flex border-b border-line bg-white no-print">
        <Stat label="Status" value={<Status value={count.status} />} />
        <Stat label="Location / WH" value={`${count.location_code} / ${count.warehouse_code || 'All'}`} />
        <Stat label="Counted" value={`${stats.counted} / ${lines.length}`} />
        <Stat label="Lines with difference" value={stats.diff ?? 'hidden'} />
        <Stat label="Total + / -" value={stats.plus === null ? 'hidden' : `+${fmtQty(stats.plus)} / ${fmtQty(stats.minus)}`} />
        <Stat label="Reasons missing" value={stats.missing} />
      </div>

      <div className="p-5 space-y-3">
        <div className="print-only">
          <div className="text-[15px] font-semibold">{company?.name} - Physical Stock Count {count.count_no}</div>
          <div>Location / WH: {count.location_name} / {count.warehouse_name || 'All warehouses'} · Snapshot {fmtDateTime(count.snapshot_at)} · Status {count.status}</div>
          <div className="mt-1">Counted by: {count.counted_by || '____________________'}   Date: ____________   Verified by: ____________________</div>
        </div>
        <ErrorBox message={err} onClose={() => setErr(null)} />
        {count.return_comment && count.status === 'COUNTING' && (
          <div className="border border-line-strong rounded px-3 py-2 text-[13px] bg-panel"><b>Sent back by Admin:</b> {count.return_comment}</div>
        )}
        <div className="text-xs text-ink-muted no-print">
          {count.status === 'DRAFT' && 'Print the sheet, count the shelf, then type the counted quantities here. '}
          {editable && 'Saving does not change stock. Every line with a difference needs a reason before you submit. '}
          {!hidden && 'System Qty is the stock at the time the shelf was counted, so goods received or issued after the sheet was started are not a difference. '}
          {hidden && 'System quantities are hidden for this count - write what you actually see. '}
          {count.blind && isAdmin && ['DRAFT', 'COUNTING', 'SUBMITTED'].includes(count.status) && 'Counters cannot see system quantities on this count; as Admin you can, and you add the reasons before approving. '}
          {count.status === 'SUBMITTED' && !isAdmin && 'Waiting for an Admin to approve. Quantities are locked.'}
          {count.status === 'POSTED' && `Approved by ${count.approved_by_name} on ${fmtDateTime(count.approved_at)}. Each difference was posted to the audit ledger with reference ${count.count_no}.`}
          {count.notes && ` Notes: ${count.notes}`}
          {(count.classification || count.category_name) && ` Filter: ${[count.classification && CLASS_LABEL[count.classification], count.category_name].filter(Boolean).join(', ')}.`}
        </div>

        {editable && (
          <div className="flex items-end gap-3 no-print">
            <Field label="Shelf counted at (optional)" hint="Only if you are typing in a paper sheet counted earlier; leave blank = now">
              <input className="input w-56" type="datetime-local" value={countedAt} onChange={(e) => setCountedAt(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-line text-[13px] no-print">
            {[['all', 'All lines'], ['uncounted', 'Not counted yet'], ...(hidden ? [] : [['variance', 'With difference']])].map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="radio" name="show" checked={show === k} onChange={() => setShow(k)} /> {label}</label>
            ))}
            <span className="ml-auto text-xs text-ink-muted">{shown.length} line(s) · press Enter to jump to the next line</span>
          </div>
          <div className="scroll-box overflow-auto max-h-[calc(100vh-17rem)] print:max-h-none print:overflow-visible">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10"><tr>
                <th className="th w-10">#</th><th className="th">WH</th><th className="th">MPN</th><th className="th">Material</th><th className="th">Lot No</th>
                <th className="th">Expiry</th><th className="th">UOM</th>
                {!hidden && <th className="th text-right">System Qty</th>}
                <th className="th text-right min-w-[120px]">Physical Qty</th>
                {!hidden && <th className="th text-right">Difference</th>}
                <th className="th min-w-[170px]">Reason for difference</th><th className="th min-w-[140px]">Note</th>
                {count.status === 'POSTED' && <th className="th text-right">Posted</th>}
                {!hidden && ['SUBMITTED', 'POSTED'].includes(count.status) && <th className="th text-right" title="Stock movement on this lot after it was counted (kept when posting)">Moved after count</th>}
              </tr></thead>
              <tbody>
                {shown.map((l, i) => {
                  const pct = l.variance && l.expected ? (l.variance / l.expected) * 100 : null;
                  const movedBefore = l.expected === null ? 0 : Math.round((l.expected - Number(l.snapshot_qty)) * 10000) / 10000;
                  return (
                    <tr key={l.id} className={needsReason(l) ? 'bg-red-50' : ''}>
                      <td className="td">{l.line_no}</td>
                      <td className="td">{l.warehouse_code}</td>
                      <td className="td whitespace-normal break-all min-w-[110px] max-w-[160px]">{l.mpn_code}</td>
                      <td className="td whitespace-normal min-w-[160px]">{l.material_code} - {l.material_name}</td>
                      <td className="td whitespace-normal break-all min-w-[110px] max-w-[170px]">{l.lot_no}{l.added_after_start && <span className="text-xs text-ink-faint"> (new)</span>}</td>
                      <td className="td">{fmtDate(l.expiry_date)}{l.is_expired ? <span className="text-danger"> (expired)</span> : ''}</td>
                      <td className="td">{l.uom}</td>
                      {!hidden && (
                        <td className="td num" title={movedBefore ? `At start ${fmtQty(l.snapshot_qty, 4)}, moved ${movedBefore > 0 ? '+' : ''}${fmtQty(movedBefore, 4)} before counting` : undefined}>
                          {fmtQty(l.expected, 4)}
                          {movedBefore !== 0 && <div className="text-xs text-ink-faint">start {fmtQty(l.snapshot_qty, 4)} {movedBefore > 0 ? '+' : ''}{fmtQty(movedBefore, 4)}</div>}
                        </td>
                      )}
                      <td className="td px-1">
                        {editable
                          ? <input className="input num" type="number" min="0" step="any" data-count-row={i} value={l.inputValue}
                            onChange={(e) => setLine(l.id, { counted_qty: e.target.value })} onKeyDown={(e) => onEnter(e, i)} />
                          : <div className="num px-2">{l.counted === null ? <span className="text-ink-faint">not counted</span> : fmtQty(l.counted, 4)}</div>}
                      </td>
                      {!hidden && (
                        <td className={`td num ${l.variance < 0 ? 'text-danger' : ''}`}>
                          {l.variance === null ? '' : `${l.variance > 0 ? '+' : ''}${fmtQty(l.variance, 4)}`}
                          {pct !== null && <span className="text-ink-faint text-xs"> ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
                        </td>
                      )}
                      <td className="td px-1">
                        {reasonsEditable && (hidden || l.variance) ? (
                          <select className="input" value={l.reason_code} onChange={(e) => setLine(l.id, { reason_code: e.target.value })}>
                            <option value="">{hidden ? '(if different)' : 'Select reason'}</option>
                            {count.reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                          </select>
                        ) : <span className="text-ink-soft">{l.reason_label || ''}</span>}
                      </td>
                      <td className="td px-1">
                        {reasonsEditable && (hidden || l.variance)
                          ? <input className="input" value={l.reason_note} placeholder={l.reason_code === 'OTHER' ? 'Required for Other' : ''} onChange={(e) => setLine(l.id, { reason_note: e.target.value })} />
                          : <span className="text-ink-soft whitespace-normal">{l.reason_note}</span>}
                      </td>
                      {count.status === 'POSTED' && <td className="td num">{l.posted_qty == null ? '' : `${l.posted_qty > 0 ? '+' : ''}${fmtQty(l.posted_qty)}`}</td>}
                      {!hidden && ['SUBMITTED', 'POSTED'].includes(count.status) && (
                        <td className={`td num ${l.moved_after_count ? 'font-medium' : 'text-ink-faint'}`}>{l.moved_after_count ? `${l.moved_after_count > 0 ? '+' : ''}${fmtQty(l.moved_after_count)}` : '-'}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {dialog?.type === 'return' && (
        <Modal title="Send count back for recount" onClose={() => setDialog(null)}
          footer={<><button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!comment.trim() || busy} onClick={() => act('return', { comment }, 'Count sent back')}>Send back</button></>}>
          <Field label="What should be recounted or fixed?" required>
            <textarea className="input h-20 py-1.5" autoFocus value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
