import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';

export default function PlansPage() {
  const { canWrite } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const { data, loading, error } = useData(() => api.get(`/plans${qs({ status })}`), [status]);
  const columns = [
    { key: 'plan_no', label: 'Plan ID' },
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}` },
    { key: 'location_code', label: 'Location' },
    { key: 'bom', label: 'BOM', value: (r) => `${r.bom_no} v${r.bom_version}` },
    { key: 'target_qty', label: 'Target Qty', align: 'right', render: (r) => fmtQty(r.target_qty), value: (r) => Number(r.target_qty) },
    { key: 'executed_qty', label: 'Executed Qty', align: 'right', render: (r) => fmtQty(r.executed_qty), value: (r) => Number(r.executed_qty) },
    { key: 'remaining_qty', label: 'Remaining Qty', align: 'right', render: (r) => fmtQty(r.remaining_qty), value: (r) => Number(r.remaining_qty) },
    { key: 'output_uom', label: 'UOM' },
    { key: 'plan_mode', label: 'Plan By', value: (r) => (r.plan_mode === 'BATCHES' ? 'Batches' : 'Quantity') },
    { key: 'batch_count', label: 'Batches Done / Planned', align: 'right', value: (r) => r.batch_count, render: (r) => `${r.batch_count} / ${r.planned_batches ?? '-'}` },
    { key: 'remaining_batches', label: 'Remaining Batches', align: 'right', value: (r) => Math.max((r.planned_batches || 0) - r.batch_count, 0) },
    { key: 'required_date', label: 'Required By', render: (r) => fmtDate(r.required_date) },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Production Plans"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/planning/new')}><Plus size={14} /> New Plan</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="plans" printTitle="Production Plans" printDateKey="created_at"
          onRowClick={(r) => navigate(`/planning/plans/${r.id}`)}
          toolbar={(
            <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )} />
      </div>
    </div>
  );
}
