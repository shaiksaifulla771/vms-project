import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtPct, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader } from '../../components/ui';

export default function BatchesPage() {
  const { canWrite } = useApp();
  const navigate = useNavigate();
  const { data, loading, error } = useData(() => api.get('/batches'), []);
  const columns = [
    { key: 'batch_no', label: 'Batch No' },
    { key: 'source', label: 'Source', value: (r) => (r.source === 'PLAN' ? `Plan ${r.plan_no}` : 'Ad Hoc') },
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}` },
    { key: 'location', label: 'Location / WH', value: (r) => `${r.location_code} / ${r.warehouse_code}` },
    { key: 'mfg_date', label: 'Mfg Date', render: (r) => fmtDate(r.mfg_date) },
    { key: 'expiry_date', label: 'Expiry Date', render: (r) => fmtDate(r.expiry_date) },
    { key: 'plan_output_qty', label: 'Plan Output', align: 'right', render: (r) => fmtQty(r.plan_output_qty), value: (r) => Number(r.plan_output_qty) },
    { key: 'actual_output_qty', label: 'Actual Output', align: 'right', render: (r) => fmtQty(r.actual_output_qty), value: (r) => Number(r.actual_output_qty) },
    { key: 'output_uom', label: 'UOM' },
    { key: 'variance_pct', label: 'Variance %', align: 'right', render: (r) => fmtPct(r.variance_pct), value: (r) => Number(r.variance_pct) },
    { key: 'executed_by', label: 'Executed By' },
    { key: 'status', label: 'Status', value: (r) => (r.status === 'REVERSED' ? 'Reversed' : 'Completed') },
  ];
  return (
    <div>
      <PageHeader title="Batches" subtitle="Executed manufacturing batches"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/manufacturing/new')}><Plus size={14} /> Batch Entry</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="batches" onRowClick={(r) => navigate(`/manufacturing/batches/${r.id}`)} />
      </div>
    </div>
  );
}
