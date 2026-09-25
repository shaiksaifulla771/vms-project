import { useState } from 'react';
import { useApp } from '../lib/app-context';
import { Field, Modal } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Shown only on paper: company, report title, what was printed (filters), who printed it and when.
 * filters: [[label, value]]; empty values are skipped.
 */
export function PrintHeader({ title, filters = [] }) {
  const { company, user } = useApp();
  const shown = filters.filter(([, v]) => v !== undefined && v !== null && v !== '');
  return (
    <div className="print-only print-header">
      <div className="flex items-baseline justify-between border-b border-ink pb-1 mb-1">
        <div className="text-[15px] font-semibold">{company?.name || 'ERP.Rorosaur'}</div>
        <div className="text-[11px]">Printed by {user?.full_name || '-'} on {new Date().toLocaleString('en-IN')}</div>
      </div>
      <div className="text-[14px] font-semibold">{title}</div>
      {shown.length > 0 && (
        <div className="text-[11px] text-ink-soft mt-0.5">{shown.map(([k, v]) => `${k}: ${v}`).join('  ·  ')}</div>
      )}
    </div>
  );
}

/**
 * The one print dialog used everywhere.
 *   scope: 'all' (every record), 'view' (current filter / search), 'selected' (ticked rows)
 *   dateMode: 'range' -> From / To, 'asOn' -> one date, null -> no date
 * onPrint({ scope, from, to, asOn })
 */
export function PrintDialog({ title, onClose, onPrint, selectedCount = 0, viewCount, allCount, dateMode = null,
  allowSelected = true, defaults = {} }) {
  const [scope, setScope] = useState(defaults.scope || 'all');
  const [from, setFrom] = useState(defaults.from || '');
  const [to, setTo] = useState(defaults.to || '');
  const [asOn, setAsOn] = useState(defaults.asOn || today());
  const [err, setErr] = useState(null);
  const go = () => {
    if (dateMode === 'range' && from && to && from > to) { setErr('From date must be on or before To date'); return; }
    if (dateMode === 'asOn' && asOn > today()) { setErr('As on date cannot be in the future'); return; }
    if (scope === 'selected' && !selectedCount) { setErr('Tick at least one row, or choose another option'); return; }
    onPrint({ scope, from, to, asOn });
  };
  const opt = (value, label, sub, disabled) => (
    <label key={value} className={`flex items-start gap-2 rounded border px-3 py-2 ${scope === value ? 'border-accent bg-accent-soft' : 'border-line'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name="print-scope" className="mt-0.5" checked={scope === value} disabled={disabled} onChange={() => setScope(value)} />
      <span><span className="font-medium">{label}</span>{sub && <span className="block text-xs text-ink-muted">{sub}</span>}</span>
    </label>
  );
  return (
    <Modal title={`Print · ${title}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={go}>Print</button></>}>
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-danger">{err}</div>}
      <div className="space-y-2">
        {opt('all', 'All records', allCount !== undefined ? `${allCount} record${allCount === 1 ? '' : 's'}` : 'Everything in this report')}
        {opt('view', 'Current filter', viewCount !== undefined ? `What is on screen now (${viewCount})` : 'Only what matches the filters on screen')}
        {allowSelected && opt('selected', 'Selected rows', selectedCount ? `${selectedCount} ticked` : 'Tick rows in the list first', !selectedCount)}
      </div>
      {dateMode === 'range' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From date" hint="Blank = from the start"><input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To date" hint="Blank = up to today"><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      )}
      {dateMode === 'asOn' && (
        <Field label="Stock as on" hint="Balance at the end of this day, rebuilt from the audit ledger">
          <input className="input w-48" type="date" value={asOn} max={today()} onChange={(e) => setAsOn(e.target.value)} />
        </Field>
      )}
      <p className="text-xs text-ink-muted">Opens the browser print window: choose your printer, or "Save as PDF".</p>
    </Modal>
  );
}

/** Print after React has painted the print-only content; calls done() once the print window closes. */
export function printAfterRender(done) {
  let finished = false;
  const finish = () => { if (!finished) { finished = true; window.removeEventListener('afterprint', finish); if (done) done(); } };
  window.addEventListener('afterprint', finish);
  // Two frames: the state change renders, then the browser lays it out before printing.
  requestAnimationFrame(() => requestAnimationFrame(() => { window.print(); setTimeout(finish, 1000); }));
}

/** Keep rows whose date field falls in [from, to] (dates as YYYY-MM-DD, inclusive). */
export function inDateRange(rows, key, from, to) {
  if (!key || (!from && !to)) return rows;
  return rows.filter((r) => {
    const d = String(r[key] || '').slice(0, 10);
    if (!d) return false;
    return (!from || d >= from) && (!to || d <= to);
  });
}
