import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search, X } from 'lucide-react';
import { downloadCsv } from '../lib/format';

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

export function Modal({ title, onClose, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
export function DataTable({ columns, rows, loading, empty = 'No records', searchable = true, exportName,
  onRowClick, rowKey = 'id', toolbar, dense = false, initialSort, scroll = true, footer }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);
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

  const shown = useMemo(() => {
    let list = rows || [];
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
  }, [rows, q, sort, columns]);

  const toggleSort = (key) => setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="card overflow-hidden">
      {(searchable || exportName || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line no-print">
          {searchable && (
            <div className="relative w-64">
              <Search size={14} className="absolute left-2 top-2 text-ink-faint" />
              <input className="input pl-7" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-muted">
            <span>{shown.length} record{shown.length === 1 ? '' : 's'}</span>
            {exportName && (
              <button type="button" className="btn-link" onClick={() => downloadCsv(`${exportName}.csv`, columns.filter((c) => !c.noExport), shown)}>
                <Download size={13} /> CSV
              </button>
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
              <tr><td className="td text-ink-muted" colSpan={columns.length}>Loading...</td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td className="td text-ink-muted" colSpan={columns.length}>{empty}</td></tr>
            )}
            {!loading && shown.map((r, i) => (
              <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-accent-soft' : 'hover:bg-panel'}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`td ${dense ? 'py-1' : ''} ${c.align === 'right' ? 'num' : ''} ${c.className || ''}`}>
                    {c.render ? c.render(r) : (c.value ? c.value(r) : r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm rounded border px-4 py-2.5 text-[13px] shadow bg-white no-print
      ${toast.type === 'error' ? 'border-red-200 text-danger' : 'border-line-strong text-ink'}`}>
      {toast.message}
    </div>
  );
}
