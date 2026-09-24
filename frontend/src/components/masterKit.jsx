/**
 * Shared pieces for master-data list pages:
 * Functions menu (Manual Entry / Bulk Entry / Bulk Update / Export), Actions column icons,
 * delete confirmation, read-only detail grid, and the Bulk upload -> preview -> save dialog.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Eye, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api, fileToBase64 } from '../lib/api';
import { useApp } from '../lib/app-context';
import { CLASS_LABEL } from '../lib/format';
import { ErrorBox, Modal } from './ui';

// ---------------------------------------------------------------------------
export function FunctionsMenu({ entity, onManual, onBulk, extra = [] }) {
  const { canWrite, notify } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const exp = async (format) => {
    setOpen(false);
    try { await api.download(`/bulk/${entity}/export?format=${format}`); } catch (e) { notify(e.message, 'error'); }
  };
  const items = [
    ...(canWrite ? [
      { label: 'Manual Entry', icon: Plus, onClick: onManual },
      { label: 'Bulk Entry', icon: Upload, onClick: () => onBulk('create') },
      { label: 'Bulk Update', icon: FileSpreadsheet, onClick: () => onBulk('update') },
      ...extra,
    ] : []),
    { label: 'Export (Excel)', icon: Download, onClick: () => exp('xlsx'), divider: canWrite },
    { label: 'Export (CSV)', icon: Download, onClick: () => exp('csv') },
  ];
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-secondary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        Functions <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-48 bg-white border border-line-strong rounded shadow py-1" role="menu">
          {items.map((it) => (
            <div key={it.label}>
              {it.divider && <div className="my-1 border-t border-line" />}
              <button type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-soft hover:bg-accent-soft hover:text-ink">
                <it.icon size={14} className="text-ink-muted" /> {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
/** Actions column definition for DataTable. */
export function actionsColumn({ onView, onEdit, onDelete, canWrite }) {
  return {
    key: '_actions', label: 'Actions', noSort: true, noExport: true, align: 'right', width: 96,
    render: (r) => (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <IconBtn title="View" onClick={() => onView(r)}><Eye size={15} /></IconBtn>
        {canWrite && <IconBtn title="Edit" onClick={() => onEdit(r)}><Pencil size={14} /></IconBtn>}
        {canWrite && onDelete && <IconBtn title="Delete" danger onClick={() => onDelete(r)}><Trash2 size={14} /></IconBtn>}
      </span>
    ),
  };
}

function IconBtn({ title, onClick, danger, children }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={`h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted hover:bg-panel ${danger ? 'hover:text-danger' : 'hover:text-accent'}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
/** Confirm, then DELETE; the API deletes or (if in use) deactivates. */
export function DeleteDialog({ label, path, onClose, onDone }) {
  const { notify } = useApp();
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.del(path);
      notify(r.action === 'deleted' ? `${label} deleted` : r.reason);
      onDone(r);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Delete ${label}?`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={go}>Delete</button></>}>
      <ErrorBox message={err} />
      <p className="text-[13px] text-ink-soft">
        If {label} is used by MPNs, BOMs, stock or transactions it will be set to <b>Inactive</b> instead, so history stays intact.
        Its code is never given to another record.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
/** Read-only label/value grid. items: [[label, value, className?]] */
export function DetailGrid({ items, cols = 3 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-2.5 ${cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {items.filter(Boolean).map(([label, value, cls]) => (
        <div key={label} className={cls || ''}>
          <dt className="text-xs2 uppercase tracking-wide text-ink-muted">{label}</dt>
          <dd className="text-[13px] text-ink break-words">{value === null || value === undefined || value === '' ? <span className="text-ink-faint">-</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, actions, children }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-panel">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
const TITLES = { materials: 'Materials', vendors: 'Vendors', mpns: 'MPNs' };
const KEY_COLS = {
  materials: { create: [['name', 'Material Name'], ['classification', 'Classification'], ['uom', 'UOM']], update: [['code', 'Code'], ['name', 'Name']] },
  vendors: { create: [['name', 'Vendor Name'], ['city', 'City'], ['phone', 'Phone']], update: [['code', 'Code'], ['name', 'Name']] },
  mpns: { create: [['material_code', 'Material'], ['vendor_code', 'Vendor'], ['uom', 'UOM'], ['moq', 'MOQ'], ['price', 'Price']],
    update: [['mpn_code', 'MPN'], ['vendor_code', 'Vendor']] },
};

/**
 * Bulk Entry (create) / Bulk Update dialog:
 * 1 download template -> 2 upload file -> 3 preview (errors / changes per row) -> 4 save all-or-nothing.
 */
export function BulkDialog({ entity, mode, onClose, onDone }) {
  const { notify, canWrite } = useApp();
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const isUpdate = mode === 'update';
  const title = `${isUpdate ? 'Bulk Update' : 'Bulk Entry'} - ${TITLES[entity]}`;

  const template = async () => {
    try { await api.download(`/bulk/${entity}/template?mode=${mode}`); } catch (e) { setErr(e.message); }
  };
  const check = async () => {
    if (!file) return;
    setErr(null); setBusy(true); setPreview(null);
    try {
      const data = await fileToBase64(file);
      const parsed = await api.post(`/bulk/${entity}/parse?mode=${mode}`, { filename: file.name, data }, { scoped: false });
      setRows(parsed.rows);
      setPreview(await api.post(`/bulk/${entity}/preview`, { mode, rows: parsed.rows }, { scoped: false }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  // Create the categories / sub-categories the file uses but that do not exist yet, then check the same rows again.
  const createMissing = async () => {
    setErr(null); setBusy(true);
    try {
      const items = preview.missing_categories.map(({ classification, category, sub_categories }) => ({ classification, category, sub_categories }));
      const r = await api.post('/categories/bulk-create', { items }, { scoped: false });
      notify(`Added ${r.categories.length} categor${r.categories.length === 1 ? 'y' : 'ies'} and ${r.sub_categories.length} sub-categor${r.sub_categories.length === 1 ? 'y' : 'ies'}`);
      setPreview(await api.post(`/bulk/${entity}/preview`, { mode, rows }, { scoped: false }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api.post(`/bulk/${entity}/commit`, { mode, rows }, { scoped: false });
      setResult(r);
      notify(`${r.saved.length} ${TITLES[entity].toLowerCase()} ${isUpdate ? 'updated' : 'created'}`);
    } catch (e) {
      setErr(e.message);
      if (e.data?.rows) setPreview({ summary: e.data.summary, rows: e.data.rows, missing_categories: e.data.missing_categories });
    }
    setBusy(false);
  };

  const s = preview?.summary;
  const missing = preview?.missing_categories || [];
  const newCats = missing.filter((m) => !m.category_exists).length;
  const newSubs = missing.reduce((n, m) => n + m.sub_categories.length, 0);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const cols = KEY_COLS[entity][mode];
  const canSave = s && s.errors === 0 && (s.create + s.update) > 0 && !result;

  return (
    <Modal title={title} onClose={result ? onDone : onClose} width="max-w-5xl"
      footer={result
        ? <button type="button" className="btn-primary" onClick={onDone}>Done</button>
        : <><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!canSave || busy} onClick={save}>
            {busy ? 'Working...' : `Save ${s ? s.create + s.update : ''} row${s && s.create + s.update === 1 ? '' : 's'}`}
          </button></>}>
      <ErrorBox message={err} onClose={() => setErr(null)} />
      {!result && (
        <ol className="grid grid-cols-3 gap-3 text-[13px]">
          <li className="border border-line rounded p-3">
            <div className="font-medium mb-1">1. Get the template</div>
            <p className="text-xs text-ink-muted mb-2">{isUpdate
              ? 'Pre-filled with current records. Edit cells you want to change; blank cells keep their value.'
              : 'One row per record. Codes are assigned automatically, so there is no code column.'}</p>
            <button type="button" className="btn-secondary" onClick={template}><Download size={14} /> Download template</button>
          </li>
          <li className="border border-line rounded p-3">
            <div className="font-medium mb-1">2. Upload the filled file</div>
            <p className="text-xs text-ink-muted mb-2">Excel (.xlsx) or CSV, up to 2000 rows.</p>
            <input type="file" accept=".xlsx,.csv" className="text-xs w-full"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
          </li>
          <li className="border border-line rounded p-3">
            <div className="font-medium mb-1">3. Check, then save</div>
            <p className="text-xs text-ink-muted mb-2">If any row has an error, nothing is saved. Fix the file and check again.</p>
            <button type="button" className="btn-secondary" disabled={!file || busy} onClick={check}>Check file</button>
          </li>
        </ol>
      )}

      {s && !result && (
        <div className="flex gap-4 text-[13px] border-y border-line py-2">
          <span>{s.total} rows</span>
          {!isUpdate && <span>{s.create} ready to create</span>}
          {isUpdate && <span>{s.update} with changes</span>}
          {isUpdate && <span className="text-ink-muted">{s.unchanged} unchanged</span>}
          {s.needs_category > 0 && <span className="font-medium">{s.needs_category} need new categories</span>}
          <span className={s.errors - (s.needs_category || 0) ? 'text-danger font-medium' : 'text-ink-muted'}>{s.errors - (s.needs_category || 0)} with errors</span>
        </div>
      )}

      {missing.length > 0 && !result && (
        <div className="border border-line rounded p-3 text-[13px] space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">New categories found in your file</div>
            {canWrite && (
              <button type="button" className="btn-primary" disabled={busy} onClick={createMissing}>
                Create {[newCats ? plural(newCats, 'category', 'categories') : null, newSubs ? plural(newSubs, 'sub-category', 'sub-categories') : null].filter(Boolean).join(', ')}
              </button>
            )}
          </div>
          {missing.map((m) => (
            <div key={`${m.classification}|${m.category}`}>
              <span className="text-ink-muted">{CLASS_LABEL[m.classification]} → </span>
              <b>{m.category}</b> <span className="text-ink-muted">{m.category_exists ? '(exists)' : '(new)'}</span>
              {m.sub_categories.length > 0 && <> <span className="text-ink-muted">→</span> {m.sub_categories.map((x) => `${x} (new)`).join(', ')}</>}
              {m.similar?.length > 0 && <span className="text-ink-muted"> · similar name already exists: {m.similar.join(', ')}. Fix the file instead if you meant that one.</span>}
            </div>
          ))}
          <div className="text-xs2 text-ink-faint">They are added to Settings → Categories under the classification shown, then the file is checked again. Nothing is saved to Materials until you press Save.</div>
        </div>
      )}

      {preview && !result && (
        <div className="max-h-[50vh] overflow-auto border border-line rounded">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="th w-14">Row</th>
                <th className="th w-24">Result</th>
                {cols.map(([k, l]) => <th key={k} className="th">{l}</th>)}
                <th className="th">{isUpdate ? 'Changes / errors' : 'Errors'}</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.filter((r) => r.errors.length || r.action !== 'unchanged').concat(preview.rows.filter((r) => !r.errors.length && r.action === 'unchanged')).map((r) => (
                <tr key={r.row_no} className={r.errors.length && !r.needs_only ? 'bg-red-50' : ''}>
                  <td className="td num">{r.row_no}</td>
                  <td className="td">{r.needs_only ? <span className="font-medium">Needs category</span> : r.errors.length ? <span className="text-danger">Error</span> : r.action === 'unchanged' ? <span className="text-ink-faint">No change</span> : r.action === 'update' ? 'Update' : 'Create'}</td>
                  {cols.map(([k]) => <td key={k} className="td">{String(r.values?.[k] ?? r[k] ?? '')}</td>)}
                  <td className="td whitespace-normal">
                    {r.needs_only && <span className="text-ink-muted">New: {r.needs.map((n) => [n.category_exists ? null : n.category, n.sub_category].filter(Boolean).join(' → ')).join('; ')}</span>}
                    {r.errors.length > 0 && !r.needs_only && <ul className="text-danger list-disc pl-4">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                    {!r.errors.length && r.changes?.map((c) => (
                      <div key={c.field}><span className="text-ink-muted">{c.field}:</span> <s className="text-ink-faint">{String(c.from ?? '-')}</s> → {String(c.to ?? '-')}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="space-y-2 text-[13px]">
          <p>{result.saved.length} {TITLES[entity].toLowerCase()} {isUpdate ? 'updated' : 'created'}.</p>
          {!isUpdate && (
            <div className="max-h-64 overflow-auto border border-line rounded">
              <table className="w-full border-collapse">
                <thead><tr><th className="th w-20">Row</th><th className="th">New code</th></tr></thead>
                <tbody>{result.saved.map((x) => <tr key={x.row_no}><td className="td num">{x.row_no}</td><td className="td font-medium">{x.code}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Multi-select built on a searchable list: chips + checkbox dropdown. options: [{value,label,sub}] */
export function MultiSelect({ values, onChange, options, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const sel = new Set(values);
  const n = q.trim().toLowerCase();
  const list = (n ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(n)) : options).slice(0, 300);
  const toggle = (v) => onChange(sel.has(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="relative" ref={ref}>
      <div className="input min-h-[32px] h-auto flex flex-wrap items-center gap-1 py-1 cursor-text" onClick={() => setOpen(true)}>
        {values.length === 0 && <span className="text-ink-faint">{placeholder}</span>}
        {values.map((v) => {
          const o = options.find((x) => x.value === v);
          return (
            <span key={v} className="inline-flex items-center gap-1 rounded border border-line bg-panel px-1.5 py-px text-xs">
              {o ? o.label : v}
              <button type="button" className="text-ink-faint hover:text-danger" aria-label="Remove"
                onClick={(e) => { e.stopPropagation(); toggle(v); }}>×</button>
            </span>
          );
        })}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-line-strong rounded shadow">
          <input autoFocus className="input border-0 border-b rounded-none" placeholder="Type to search" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-64 overflow-y-auto">
            {list.length === 0 && <div className="px-3 py-2 text-ink-muted">No matches</div>}
            {list.map((o) => (
              <label key={o.value} className="flex items-start gap-2 px-3 py-1.5 hover:bg-accent-soft cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={sel.has(o.value)} onChange={() => toggle(o.value)} />
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="block text-xs2 text-ink-muted truncate">{o.sub}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
