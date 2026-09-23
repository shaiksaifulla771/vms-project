import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { useData } from '../../lib/app-context';
import { TXN_LABEL, fmtDateTime, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, Field, PageHeader } from '../../components/ui';
import { Combobox, mpnOptions, useMpns } from '../../components/pickers';

export default function TransactionsPage() {
  const mpns = useMpns();
  const [f, setF] = useState({ from: '', to: '', type: '', mpn_id: '' });
  const { data, loading, error } = useData(() => api.get(`/inventory/ledger${qs(f)}`), [f.from, f.to, f.type, f.mpn_id]);
  const columns = [
    { key: 'txn_no', label: 'Txn ID', align: 'right' },
    { key: 'txn_at', label: 'Timestamp', render: (r) => fmtDateTime(r.txn_at) },
    { key: 'user_name', label: 'User' },
    { key: 'txn_type', label: 'Type', value: (r) => TXN_LABEL[r.txn_type] || r.txn_type },
    { key: 'mpn_code', label: 'MPN' },
    { key: 'material_name', label: 'Material' },
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
        <div className="card p-3 grid grid-cols-5 gap-3">
          <Field label="From"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Transaction Type">
            <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="">All</option>
              {Object.entries(TXN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="MPN" className="col-span-2">
            <div className="flex gap-2">
              <div className="flex-1"><Combobox value={f.mpn_id} onChange={(v) => setF({ ...f, mpn_id: v })} options={mpnOptions(mpns)} placeholder="All MPNs" /></div>
              {f.mpn_id && <button type="button" className="btn-link" onClick={() => setF({ ...f, mpn_id: '' })}>Clear</button>}
            </div>
          </Field>
        </div>
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="transactions" rowKey="id" />
      </div>
    </div>
  );
}
