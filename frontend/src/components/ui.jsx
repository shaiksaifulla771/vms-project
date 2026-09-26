import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Download, Printer, Search, X } from 'lucide-react';
import { downloadCsv, today } from '../lib/format';
import { PrintDialog, PrintHeader, inDateRange, printAfterRender } from './print';
import { usePersistedState } from '../lib/usePersisted';

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 bg-white no-print">
      <div className="min-w-0">
        <h1 className="text-[16px] font-semibold text-ink leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      {children}
    </div>
  );
}

export function Field({ label, required, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
      {hint && <span className="block text-xs2 text-ink-faint mt-0.5">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder, className = '', ...rest }) {
  return (
    <select className={`input ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
}

export function ErrorBox({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 border border-red-200 bg-red-50 text-danger rounded px-3 py-2 text-[13px]">
      <span>{message}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>}
    </div>
  );
}

export function Loading({ text = 'Loading...' }) {
  return <div className="px-5 py-8 text-ink-muted">{text}</div>;
}

/** When true, <Modal> renders as a full page (used by the /new and /:id/edit routes of record forms). */
export const ModalAsPage = createContext(false);

export function Modal({ title, onClose, children, footer, width = 'max-w-lg' }) {
  const asPage = useContext(ModalAsPage);
  useEffect(() => {
    if (asPage) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, asPage]);
  if (asPage) {
    return (
      <ModalAsPage.Provider value={false}>
        <PageHeader title={title} />
        <div className="p-5">
          <div className="card max-w-5xl" role="form" aria-label={title}>
            <div className="p-4 space-y-3">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5 bg-panel sticky bottom-0">{footer}</div>}
          </div>
        </div>
      </ModalAsPage.Provider>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 overflow-y-auto no-print">
      <div className={`w-full ${width} bg-white rounded border border-line shadow-lg mt-10`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5 bg-panel">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-4 border-b border-line px-5 bg-white no-print">
      {tabs.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)}
          className={`py-2 text-[13px] border-b-2 -mb-px ${value === t.value ? 'border-accent text-accent font-medium' : 'border-transparent text-ink-soft hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Status({ value }) {
  const muted = ['OBSOLETE', 'CANCELLED', 'INACTIVE', 'DRAFT'].includes(value);
  const alert = ['SHORT', 'EXPIRED'].includes(value);
  return (
    <span className={`inline-block rounded border px-1.5 py-px text-xs2 font-medium uppercase tracking-wide
      ${alert ? 'border-red-200 text-danger' : muted ? 'border-line text-ink-faint' : 'border-line-strong text-ink-soft'}`}>
      {String(value || '').replace(/_/g, ' ')}
    </span>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="px-4 py-2.5 border-r border-line last:border-r-0 min-w-[130px]">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-[16px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs2 text-ink-faint">{sub}</div>}
    </div>
  );
}

/**
 * Data grid: sortable columns, quick search, CSV export.
 * columns: [{ key, label, render?(row), value?(row) (for sort/search/csv), align:'right', width }]
 */
/** Added today (local date)? Used for the NEW tag and the "added today" counter. */
export const isNewToday = (ts) => {
  if (!ts) return false;
  const d = new Date(ts); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

/** Small NEW tag for records added today. */
export function NewTag({ ts }) {
  return isNewToday(ts) ? <span className="ml-1.5 inline-block rounded px-1 py-px text-[10px] font-semibold leading-none tracking-wide bg-accent text-white align-middle">NEW</span> : null;
}

/**
 * Data grid. With `newField` (e.g. 'created_at') the list opens newest first, records added today get a NEW tag
 * and a light-blue row, and the top right shows an "N added today" filter plus a "Newest first" reset.
 */
export function DataTable({ columns, rows, loading, empty = 'No records', searchable = true, exportName,
  onRowClick, rowKey = 'id', toolbar, dense = false, initialSort, scroll = true, footer, newField,
  printTitle, printFilters = [], printDateKey, printDateMode, onPrintAll, onPrintView, printSelectable = true,
  stateKey, groupBy, printMatch }) {
  // Search, sort and "added today" are remembered per list, so Back returns to the list as it was left.
  const memKey = stateKey || exportName || printTitle || `path:${window.location.pathname}`;
  const [q, setQ] = usePersistedState(memKey ? `${memKey}.q` : '_', '');
  // Printing: tick rows, choose All / Current filter / Selected (+ dates), print a clean table.
  const [picked, setPicked] = useState(() => new Set());
  const [printing, setPrinting] = useState(null);         // { rows, filters }
  const [printAsk, setPrintAsk] = useState(false);
  const [printErr, setPrintErr] = useState(null);
  const [optRows, setOptRows] = useState(null);             // every record, so the print filters list all values
  useEffect(() => { setOptRows(null); }, [rows]);
  const canPick = Boolean(printTitle) && printSelectable;
  const defaultSort = initialSort || (newField ? { key: newField, dir: 'desc' } : null);
  const [sort, setSort] = usePersistedState(memKey ? `${memKey}.sort` : '_sort', defaultSort);
  const [onlyNew, setOnlyNew] = usePersistedState(memKey ? `${memKey}.new` : '_new', false);
  const box = useRef(null);
  const [boxH, setBoxH] = useState(null);
  // Fit the scroll box to the space left on screen, so its sideways scrollbar is always visible.
  useLayoutEffect(() => {
    if (!scroll) return undefined;
    const fit = () => {
      if (!box.current) return;
      const top = box.current.getBoundingClientRect().top + window.scrollY;
      setBoxH(Math.max(window.innerHeight - top - (footer ? 64 : 24), 240));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [scroll, footer ? 1 : 0, toolbar ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const val = (c, r) => (c.value ? c.value(r) : r[c.key]);

  const newCount = newField ? (rows || []).filter((r) => isNewToday(r[newField])).length : 0;
  const shown = useMemo(() => {
    let list = rows || [];
    if (onlyNew && newField) list = list.filter((r) => isNewToday(r[newField]));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) => columns.some((c) => {
        const x = val(c, r);
        return x !== null && x !== undefined && String(x).toLowerCase().includes(needle);
      }));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        list = [...list].sort((a, b) => {
          const x = val(col, a); const y = val(col, b);
          if (x === y) return 0;
          if (x === null || x === undefined || x === '') return 1;
          if (y === null || y === undefined || y === '') return -1;
          const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, columns, onlyNew]);

  // Group headers only while the list is in its grouped order (sorting by another column turns them off).
  const grouping = Boolean(groupBy) && (!sort || !defaultSort || sort.key === defaultSort.key);
  const toggleSort = (key) => setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const keyOf = (r, i) => r[rowKey] ?? i;
  const pickedRows = shown.filter((r, i) => picked.has(keyOf(r, i)));
  const allPicked = shown.length > 0 && pickedRows.length === shown.length;
  const togglePick = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // Button / action columns (not exported) are not printed either.
  const printCols = columns.filter((c) => !c.noPrint && !c.noExport && c.key !== '_actions');
  // Columns marked printFilter offer a "print only this value" choice in the dialog (location, material, type ...).
  const filterCols = printCols.filter((c) => c.printFilter);
  const filterOptions = filterCols.map((c) => ({
    key: c.key, label: c.label,
    values: [...new Set([...(rows || []), ...(optRows || [])].map((r) => val(c, r)).filter((x) => x !== null && x !== undefined && x !== ''))].map(String).sort(),
  }));
  const openPrint = async () => {
    setPrintAsk(true);
    // Load every record once so the dialog's filters offer every location / material / type, not just those on screen.
    if (onPrintAll && filterCols.length && !optRows) {
      try { const got = await onPrintAll({ scope: 'all', from: '', to: '', asOn: today(), forOptions: true }); setOptRows((Array.isArray(got) ? got : got?.rows) || null); } catch { /* the loaded rows still work */ }
    }
  };
  const doPrint = async (opt) => {
    setPrintAsk(false);
    setPrintErr(null);
    try {
      let list;
      let note = '';
      let serverDates = false;
      // A fetcher returns rows, or { rows, serverDates, note } (dates already applied / a note for the paper).
      const unwrap = (got) => {
        if (got && !Array.isArray(got)) { serverDates = Boolean(got.serverDates); note = got.note || ''; return got.rows; }
        return got;
      };
      // "All" loads every record (ignoring the page's filters) when the page can fetch them; server-paged
      // reports load every matching row for "Current filter" too (not just the page on screen).
      if (opt.scope === 'selected' && printMatch && opt.asOn && opt.asOn !== today() && onPrintAll) {
        // Selected rows "as on" a past date: the same lots, with their balance on that date.
        const keys = new Set(pickedRows.map(printMatch));
        list = (unwrap(await onPrintAll(opt)) || []).filter((r) => keys.has(printMatch(r)));
      } else if (opt.scope === 'selected') list = pickedRows;
      else if (opt.scope === 'all' && onPrintAll) list = unwrap(await onPrintAll(opt));
      else if (opt.scope === 'view' && onPrintView) list = unwrap(await onPrintView(opt));
      // A fetcher may return nothing to mean "use what is already loaded".
      if (!list) list = opt.scope === 'view' ? shown : (rows || []);
      if (!serverDates) list = inDateRange(list, printDateKey, opt.from, opt.to);
      const chosen = Object.entries(opt.fields || {}).filter(([, v]) => v);
      for (const [k, v] of chosen) {
        const c = printCols.find((x) => x.key === k);
        if (c) list = list.filter((r) => String(val(c, r) ?? '') === v);
      }
      const scopeLabel = { all: 'All records', view: 'Current filter', selected: 'Selected rows' }[opt.scope];
      const dates = opt.asOn ? `as on ${opt.asOn}` : (opt.from || opt.to ? `${opt.from || 'start'} to ${opt.to || 'today'}` : '');
      const fieldLabels = chosen.map(([k, v]) => [printCols.find((x) => x.key === k)?.label || k, v]);
      // "All" from a fetcher covers every location: drop the on-screen location / warehouse labels.
      const everywhere = opt.scope === 'all' && onPrintAll;
      const baseFilters = everywhere ? [...printFilters.filter(([k]) => !['Location', 'Warehouse'].includes(k)), ['Location', 'All locations']] : printFilters;
      if (groupBy) list = [...list].sort((a, b) => String(groupBy(a)).localeCompare(String(groupBy(b)), undefined, { numeric: true }));
      setPrinting({ rows: list, filters: [['Printed', scopeLabel], ['Dates', dates], ...baseFilters, ...fieldLabels, ['Rows', String(list.length)], ['Note', note]] });
      // Only the report goes on paper: the page (filters, cards, sidebar) is hidden while printing.
      document.body.classList.add('printing-report');
      printAfterRender(() => { document.body.classList.remove('printing-report'); setPrinting(null); });
    } catch (e) { setPrintErr(e.message); }
  };
  // Totals: a plain sum, or for quantities (total: 'uom') only when every printed row has the same unit.
  const totalOf = (c, list) => {
    if (c.total === 'uom') {
      const units = new Set(list.map((r) => r.uom || r.output_uom || ''));
      if (units.size !== 1) return 'mixed units';
      const sum = list.reduce((a, r) => a + (Number(val(c, r)) || 0), 0);
      return `${sum.toLocaleString('en-IN', { maximumFractionDigits: 4 })} ${[...units][0]}`;
    }
    return list.reduce((a, r) => a + (Number(val(c, r)) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  };
  const totals = printing && printCols.some((c) => c.total)
    ? Object.fromEntries(printCols.filter((c) => c.total).map((c) => [c.key, totalOf(c, printing.rows)]))
    : null;

  return (
    <>
    {printing && createPortal(
      <div className={`print-only print-table ${printCols.length > 8 ? 'print-wide' : ''}`}>
        <PrintHeader title={printTitle} filters={printing.filters} />
        <table className="w-full border-collapse">
          <thead><tr>{printCols.map((c) => <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {printing.rows.length === 0 && <tr><td className="td" colSpan={printCols.length}>No records</td></tr>}
            {printing.rows.map((r, i) => [
              groupBy && (i === 0 || groupBy(printing.rows[i - 1]) !== groupBy(r)) && (
                <tr key={`g-${i}`}><td colSpan={printCols.length} className="td font-semibold">{groupBy(r)}</td></tr>
              ),
              <tr key={keyOf(r, i)}>
                {printCols.map((c) => (
                  <td key={c.key} className={`td ${c.align === 'right' ? 'num' : ''}`}>
                    {c.printValue ? c.printValue(r) : (c.render ? c.render(r) : (c.value ? c.value(r) : r[c.key]))}
                  </td>
                ))}
              </tr>,
            ])}
          </tbody>
          {totals && (
            <tfoot><tr>{printCols.map((c, i) => (
              <td key={c.key} className={`td font-semibold ${c.align === 'right' ? 'num' : ''}`}>
                {c.key in totals ? totals[c.key] : (i === 0 ? 'Total' : '')}
              </td>
            ))}</tr></tfoot>
          )}
        </table>
      </div>,
      document.body,
    )}
    {printAsk && (
      <PrintDialog title={printTitle} onClose={() => setPrintAsk(false)} onPrint={doPrint} selectedCount={pickedRows.length}
        viewCount={onPrintView ? undefined : shown.length} allCount={onPrintAll ? undefined : (rows || []).length} allowSelected={canPick}
        dateMode={printDateMode || (printDateKey ? 'range' : null)} fields={filterOptions} />
    )}
    <div className={`card overflow-hidden ${printing ? 'no-print' : ''}`}>
      {printErr && <div className="px-3 py-2 text-[13px] text-danger border-b border-line no-print">{printErr}</div>}
      {(searchable || exportName || toolbar || printTitle) && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line no-print">
          {searchable && (
            <div className="relative w-64">
              <Search size={14} className="absolute left-2 top-2 text-ink-faint" />
              <input className="input pl-7" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-muted">
            {newField && newCount > 0 && (
              <button type="button" title={onlyNew ? 'Show all records' : 'Show only records added today'} onClick={() => setOnlyNew((x) => !x)}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${onlyNew ? 'border-accent bg-accent text-white' : 'border-accent text-accent hover:bg-accent-soft'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${onlyNew ? 'bg-white' : 'bg-accent'}`} />{newCount} added today
              </button>
            )}
            {newField && (sort?.key !== newField || sort?.dir !== 'desc') && (
              <button type="button" className="btn-link" onClick={() => setSort({ key: newField, dir: 'desc' })}>Newest first</button>
            )}
            <span>{shown.length} record{shown.length === 1 ? '' : 's'}</span>
            {canPick && pickedRows.length > 0 && (
              <button type="button" className="btn-link" onClick={() => setPicked(new Set())}>{pickedRows.length} selected · clear</button>
            )}
            {exportName && (
              <button type="button" className="btn-link" onClick={() => downloadCsv(`${exportName}.csv`, columns.filter((c) => !c.noExport), shown)}>
                <Download size={13} /> CSV
              </button>
            )}
            {printTitle && (
              <button type="button" className="btn-link" onClick={openPrint}><Printer size={13} /> Print</button>
            )}
          </div>
        </div>
      )}
      {/* Scroll box as tall as the screen: headers stay visible and the sideways scrollbar is always reachable. */}
      <div ref={box} className={scroll ? 'scroll-box overflow-auto min-h-[8rem] print:overflow-visible' : 'overflow-x-auto'}
        style={scroll && boxH ? { maxHeight: boxH } : undefined}>
        <table className="w-full border-collapse">
          <thead className={scroll ? 'sticky top-0 z-10' : ''}>
            <tr>
              {canPick && (
                <th className="th w-8 no-print" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label="Select all rows" checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r, i) => keyOf(r, i))))} />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''} ${c.noSort ? '' : 'cursor-pointer'}`}
                  style={c.width ? { width: c.width } : undefined} onClick={() => !c.noSort && toggleSort(c.key)}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="td text-ink-muted" colSpan={columns.length + (canPick ? 1 : 0)}>Loading...</td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td className="td text-ink-muted" colSpan={columns.length + (canPick ? 1 : 0)}>{empty}</td></tr>
            )}
            {!loading && shown.map((r, i) => [
              grouping && (i === 0 || groupBy(shown[i - 1]) !== groupBy(r)) && (
                <tr key={`g-${groupBy(r)}-${i}`} className="bg-panel">
                  <td colSpan={columns.length + (canPick ? 1 : 0)} className="td font-semibold text-ink">{groupBy(r)}</td>
                </tr>
              ),
              <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`${newField && isNewToday(r[newField]) ? 'bg-accent-soft/40' : ''} ${onRowClick ? 'cursor-pointer hover:bg-accent-soft' : 'hover:bg-panel'}`}>
                {canPick && (
                  <td className="td w-8 no-print" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select row" checked={picked.has(keyOf(r, i))} onChange={() => togglePick(keyOf(r, i))} />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td key={c.key} className={`td ${dense ? 'py-1' : ''} ${c.align === 'right' ? 'num' : ''} ${c.className || ''}`}>
                    {c.render ? c.render(r) : (c.value ? c.value(r) : r[c.key])}
                    {newField && ci === 0 && <NewTag ts={r[newField]} />}
                  </td>
                ))}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
    </>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-14 right-4 z-50 max-w-sm rounded border px-4 py-2.5 text-[13px] shadow bg-white no-print
      ${toast.type === 'error' ? 'border-red-200 text-danger' : 'border-line-strong text-ink'}`}>
      {toast.message}
    </div>
  );
}
