import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtByUom, fmtDateTime } from '../../lib/format';
import { DataTable, ErrorBox, Field, Modal, PageHeader, Status } from '../../components/ui';
import { LocationWarehouse, useCategories, useDefaultScope } from '../../components/pickers';
import { usePersistedState } from '../../lib/usePersisted';

const STATUS_HELP = {
  DRAFT: 'Snapshot taken - print the sheet and start counting',
  COUNTING: 'Counts being entered',
  SUBMITTED: 'Waiting for Admin approval',
  POSTED: 'Approved - adjustments posted',
  CANCELLED: 'Cancelled - nothing posted',
};

function NewCountDialog({ onClose, onDone }) {
  const def = useDefaultScope();
  const cats = useCategories();
  const [f, setF] = useState({ location_id: def.locationId, warehouse_id: def.warehouseId, classification: '', category_id: '', blind: false, include_zero: false, counted_by: '', notes: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setErr(null); setBusy(true);
    try { onDone(await api.post('/stock-counts', { ...f, warehouse_id: f.warehouse_id || null, classification: f.classification || null, category_id: f.category_id || null })); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Start a physical stock count" onClose={onClose} width="max-w-2xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy || !f.location_id} onClick={start}>Start count</button></>}>
      <ErrorBox message={err} />
      <p className="text-[13px] text-ink-soft">The system takes a snapshot of every lot with stock in the area you choose. Nothing changes in stock until an Admin approves the finished count.
        Goods received or issued while you count are taken into account: each line is compared with the stock at the time it was counted.</p>
      <LocationWarehouse locationId={f.location_id} warehouseId={f.warehouse_id} required allowAllWarehouses
        onChange={(l, w) => setF({ ...f, location_id: l, warehouse_id: w })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Only this classification (optional)">
          <select className="input" value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })}>
            <option value="">All</option>
            {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Only this category (optional)">
          <select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">All</option>
            {cats.map((c) => [<option key={c.id} value={c.id}>{c.name}</option>,
              ...c.children.map((s) => <option key={s.id} value={s.id}>&nbsp;&nbsp;{c.name} / {s.name}</option>)])}
          </select>
        </Field>
        <Field label="Counted by"><input className="input" value={f.counted_by} placeholder="Name of the person counting" onChange={(e) => setF({ ...f, counted_by: e.target.value })} /></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <label className="flex items-start gap-2 text-[13px] border border-line rounded p-3">
        <input type="checkbox" className="mt-0.5" checked={f.include_zero} onChange={(e) => setF({ ...f, include_zero: e.target.checked })} />
        <span>
          <span className="font-medium">Include lots with zero stock</span>
          <span className="block text-ink-muted text-xs">Lets you record stock found on the shelf for a lot the system shows as empty.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-[13px] border border-line rounded p-3">
        <input type="checkbox" className="mt-0.5" checked={f.blind} onChange={(e) => setF({ ...f, blind: e.target.checked })} />
        <span>
          <span className="font-medium">Hide system quantity from counters</span>
          <span className="block text-ink-muted text-xs">Staff see only an empty box and write what they actually count, so they cannot copy the system number.
            The Admin sees the differences when approving and adds the reasons.</span>
        </span>
      </label>
    </Modal>
  );
}

export default function StockCountsPage() {
  const { canWrite } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = usePersistedState('counts.status', '');
  const [modal, setModal] = useState(false);
  const { data, loading, error } = useData(() => api.get(`/stock-counts${qs({ status })}`), [status]);

  const columns = [
    { key: 'count_no', label: 'Count No' },
    { key: 'created_at', label: 'Started', render: (r) => fmtDateTime(r.created_at), value: (r) => r.created_at },
    { key: 'scope', label: 'Location / WH', value: (r) => `${r.location_code} / ${r.warehouse_code || 'All WH'}`, printFilter: true },
    { key: 'filter', label: 'Filter', value: (r) => [r.classification && CLASS_LABEL[r.classification], r.category_name].filter(Boolean).join(', ') || 'All stock' },
    { key: 'blind', label: 'Hidden qty', value: (r) => (r.blind ? 'Yes' : '') },
    { key: 'progress', label: 'Counted', align: 'right', value: (r) => `${r.counted_count} / ${r.line_count}` },
    { key: 'variance_count', label: 'Lines with difference', align: 'right', value: (r) => (r.variance_count ?? 'hidden') },
    { key: 'net', label: 'Total + / -', align: 'right', value: (r) => (r.variance_by_uom == null ? '' : fmtByUom(r.variance_by_uom)) },
    { key: 'counted_by', label: 'Counted by' },
    { key: 'approved_by_name', label: 'Approved by' },
    { key: 'status', label: 'Status', render: (r) => <span title={STATUS_HELP[r.status]}><Status value={r.status} /></span>, value: (r) => r.status },
  ];

  return (
    <div>
      <PageHeader title="Physical Stock Count"
        subtitle="Count stock, explain differences, Admin approves before stock changes."
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Start Count</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} printTitle="Physical Stock Counts" printDateKey="created_at" onPrintAll={() => api.get('/stock-counts', { scoped: false })} onRowClick={(r) => navigate(`/inventory/stock-counts/${r.id}`)}
          empty="No counts yet. Click Start Count to take a snapshot."
          toolbar={(
            <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.keys(STATUS_HELP).map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </select>
          )} />
      </div>
      {modal && <NewCountDialog onClose={() => setModal(false)} onDone={(c) => navigate(`/inventory/stock-counts/${c.id}`)} />}
    </div>
  );
}
