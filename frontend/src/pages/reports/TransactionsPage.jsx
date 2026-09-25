import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { useData } from '../../lib/app-context';
import { TXN_LABEL, fmtDateTime, fmtQty, mpnLabel } from '../../lib/format';
import { DataTable, ErrorBox, Field, PageHeader } from '../../components/ui';
import { Combobox, mpnOptions, useMpns } from '../../components/pickers';

export default function TransactionsPage() {
  const mpns = useMpns();
  const [f, setF] = useState({ from: '', to: '', type: '', mpn_id: '', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(100);
  const setFilter = (patch) => { setPage(1); setF({ ...f, ...patch }); };
  // Server-side paging: the audit ledger grows forever, so only one page is loaded at a time.
  const { data, loading, error } = useData(() => api.get(`/inventory/ledger${qs({ ...f, page, page_size: size })}`),
    [f.from, f.to, f.type, f.mpn_id, f.q, page, size]);
  const total = data?.total || 0;
  const pages = Math.max(Math.ceil(total / size), 1);
  const columns = [
    { key: 'txn_no', label: 'Txn ID', align: 'right' },
    { key: 'txn_at', label: 'Timestamp', render: (r) => fmtDateTime(r.txn_at) },
    { key: 'user_name', label: 'User' },
    { key: 'txn_type', label: 'Type', value: (r) => TXN_LABEL[r.txn_type] || r.txn_type },
    { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) },
    { key: 'material_name', label: 'Material', className: 'whitespace-normal min-w-[180px]' },
    { key: 'lot_no', label: 'Lot No', render: (r) => <Link className="text-accent hover:underline" onClick={(e) => e.stopPropagation()} to={`/reports/traceability?mpn_id=${r.mpn_id}&lot_no=${encodeURIComponent(r.lot_no)}`}>{r.lot_no}</Link>, value: (r) => r.lot_no },
    { key: 'qty_change', label: 'Qty Change', align: 'right', render: (r) => `${r.qty_change > 0 ? '+' : ''}${fmtQty(r.qty_change)}`, value: (r) => Number(r.qty_change) },
    { key: 'new_balance', label: 'New Balance', align: 'right', render: (r) => fmtQty(r.new_balance), value: (r) => Number(r.new_balance) },
    { key: 'uom', label: 'UOM' },
    { key: 'location_code', label: 'Location' },
    { key: 'warehouse_code', label: 'WH' },
    { key: 'reference_id', label: 'Reference', value: (r) => [r.reference_type, r.reference_id].filter(Boolean).join(' ') },
    { key: 'reason', label: 'Reason' },
  ];
  return (
    <div>
      <PageHeader title="Transaction Report" subtitle="Audit ledger - every inventory change, immutable. Scoped by the global Location / WH selector." />
      <div className="p-5 space-y-3">
        <div className="card p-3 grid grid-cols-6 gap-3">
          <Field label="From"><input className="input" type="date" value={f.from} onChange={(e) => setFilter({ from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={f.to} onChange={(e) => setFilter({ to: e.target.value })} /></Field>
          <Field label="Transaction Type">
            <select className="input" value={f.type} onChange={(e) => setFilter({ type: e.target.value })}>
              <option value="">All</option>
              {Object.entries(TXN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="MPN" className="col-span-2">
            <div className="flex gap-2">
              <div className="flex-1"><Combobox value={f.mpn_id} onChange={(v) => setFilter({ mpn_id: v })} options={mpnOptions(mpns)} placeholder="All MPNs" /></div>
              {f.mpn_id && <button type="button" className="btn-link" onClick={() => setFilter({ mpn_id: '' })}>Clear</button>}
            </div>
          </Field>
          <Field label="Search (lot, reference, material)">
            <input className="input" value={search} placeholder="Press Enter" onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setFilter({ q: search.trim() }); }} onBlur={() => search.trim() !== f.q && setFilter({ q: search.trim() })} />
          </Field>
        </div>
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data?.rows || []} loading={loading} exportName="transactions" rowKey="id" searchable={false}
          printTitle="Transaction Report" printDateKey="txn_at"
          printFilters={[['Type', f.type ? (TXN_LABEL[f.type] || f.type) : ''], ['Search', f.q]]}
          onPrintFetch={(opt) => api.get(`/inventory/ledger${qs({
            ...(opt.scope === 'view' ? { type: f.type, mpn_id: f.mpn_id, q: f.q } : {}),
            from: opt.from || (opt.scope === 'view' ? f.from : ''), to: opt.to || (opt.scope === 'view' ? f.to : ''), limit: 5000 })}`)}
          toolbar={<span className="text-xs text-ink-muted">{total.toLocaleString('en-IN')} transactions · CSV exports this page</span>}
          footer={(
            <div className="flex items-center justify-end gap-3 px-3 py-2 border-t border-line text-[13px] no-print">
              <span className="text-ink-muted">Rows per page</span>
              <select className="input h-7 w-20" value={size} onChange={(e) => { setPage(1); setSize(Number(e.target.value)); }}>
                {[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-ink-muted">{total ? `${(page - 1) * size + 1}-${Math.min(page * size, total)} of ${total}` : '0 of 0'}</span>
              <button type="button" className="btn-secondary h-7" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
              <button type="button" className="btn-secondary h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn-secondary h-7" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              <button type="button" className="btn-secondary h-7" disabled={page >= pages} onClick={() => setPage(pages)}>Last</button>
            </div>
          )} />
      </div>
    </div>
  );
}
