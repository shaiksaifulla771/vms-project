import { useState } from 'react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDateTime, fmtQty, mpnLabel } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';
import { usePersistedState } from '../../lib/usePersisted';

export default function TransfersPage() {
  const { canWrite, notify } = useApp();
  const [status, setStatus] = usePersistedState('transfers.status', '');
  const [err, setErr] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get(`/transfers${qs({ status })}`), [status]);

  const act = async (t, action, label) => {
    setErr(null);
    try {
      await api.post(`/transfers/${t.id}/${action}`);
      notify(`${t.transfer_no} ${label}`);
      reload();
    } catch (e) { setErr(e.message); }
  };

  const columns = [
    { key: 'transfer_no', label: 'Transfer No' },
    { key: 'created_at', label: 'Created', render: (r) => fmtDateTime(r.created_at) },
    { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) },
    { key: 'material_name', label: 'Material', printFilter: true },
    { key: 'lot_no', label: 'Lot No' },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => `${fmtQty(r.qty)} ${r.uom}`, value: (r) => Number(r.qty) },
    { key: 'from', label: 'From', value: (r) => `${r.from_location_code} / ${r.from_warehouse_code}`, printFilter: true },
    { key: 'to', label: 'To', value: (r) => `${r.to_location_code} / ${r.to_warehouse_code}`, printFilter: true },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
    { key: 'reason', label: 'Reason' },
    ...(canWrite ? [{
      key: 'actions', label: '', noSort: true, noExport: true, render: (r) => (
        <span className="flex gap-3 justify-end">
          {r.status === 'DRAFT' && <button type="button" className="btn-link" onClick={() => act(r, 'dispatch', 'dispatched - stock left the source warehouse')}>Dispatch</button>}
          {r.status === 'IN_TRANSIT' && <button type="button" className="btn-link" onClick={() => act(r, 'complete', 'completed - stock received at the destination')}>Mark Completed</button>}
          {['DRAFT', 'IN_TRANSIT'].includes(r.status) && <button type="button" className="btn-danger-link" onClick={() => act(r, 'cancel', r.status === 'IN_TRANSIT' ? 'cancelled - stock returned to the source' : 'cancelled')}>Cancel</button>}
        </span>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Stock Transfers" subtitle="Draft → In-Transit → Completed. Dispatch takes the stock out of the source; Completed adds it at the destination; cancelling an In-Transit transfer puts it back. Create a transfer from the Stock page (row action)." />
      <div className="p-5 space-y-3">
        <ErrorBox message={err || error} onClose={() => setErr(null)} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="transfers" printTitle="Stock Transfers"
          onPrintAll={() => api.get('/transfers', { scoped: false })} printDateKey="created_at"
          toolbar={(
            <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )} />
      </div>
    </div>
  );
}
