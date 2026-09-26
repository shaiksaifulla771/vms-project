import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtPct, fmtQty } from '../../lib/format';
import { ActionMenu, DataTable, ErrorBox, PageHeader } from '../../components/ui';

export default function BatchesPage() {
  const { canWrite, isAdmin } = useApp();
  const navigate = useNavigate();
  const { data, loading, error } = useData(() => api.get('/batches'), []);
  const columns = [
    { key: 'batch_no', label: 'Batch No' },
    { key: 'source', label: 'Source', value: (r) => (r.source === 'PLAN' ? `Plan ${r.plan_no}` : 'Ad Hoc') },
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}`, printFilter: true },
    { key: 'location', label: 'Location / WH', value: (r) => `${r.location_code} / ${r.warehouse_code}`, printFilter: true },
    { key: 'mfg_date', label: 'Mfg Date', render: (r) => fmtDate(r.mfg_date) },
    { key: 'expiry_date', label: 'Expiry Date', render: (r) => fmtDate(r.expiry_date) },
    { key: 'plan_output_qty', label: 'Plan Output', align: 'right', render: (r) => fmtQty(r.plan_output_qty), value: (r) => Number(r.plan_output_qty) },
    { key: 'actual_output_qty', label: 'Actual Output', align: 'right', render: (r) => fmtQty(r.actual_output_qty), value: (r) => Number(r.actual_output_qty), total: 'uom' },
    { key: 'output_uom', label: 'UOM' },
    { key: 'variance_pct', label: 'Variance %', align: 'right', render: (r) => fmtPct(r.variance_pct), value: (r) => Number(r.variance_pct) },
    { key: 'executed_by', label: 'Executed By' },
    { key: 'status', label: 'Status', value: (r) => (r.status === 'REVERSED' ? 'Reversed' : 'Completed'), printFilter: true },
    { key: '_actions', label: '', noSort: true, noPrint: true, noExport: true, width: 40, render: (r) => {
      const open = r.status !== 'REVERSED';
      const go = (act) => navigate(`/manufacturing/batches/${r.id}${act ? `?do=${act}` : ''}`);
      return (
        <ActionMenu label={`Actions for batch ${r.batch_no}`} items={[
          { label: 'View', onClick: () => go() },
          { label: 'Open plan', onClick: () => navigate(`/planning/plans/${r.plan_id}`), hidden: !r.plan_id },
          { label: 'Trace lot', onClick: () => navigate(`/reports/traceability?mpn_id=${r.output_mpn_id}&lot_no=${encodeURIComponent(r.batch_no)}`), hidden: !r.output_mpn_id },
          { label: 'Print', onClick: () => go('print') },
          { label: 'Edit IP / OP', onClick: () => go('edit'), hidden: !canWrite || !open },
          { label: 'Reverse batch', onClick: () => go('reverse'), danger: true, hidden: !isAdmin || !open },
        ]} />
      );
    } },
  ];
  return (
    <div>
      <PageHeader title="Batches"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/manufacturing/new')}><Plus size={14} /> Batch Entry</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="batches" printTitle="Production Batches" printDateKey="mfg_date" onPrintAll={() => api.get('/batches', { scoped: false })} onRowClick={(r) => navigate(`/manufacturing/batches/${r.id}`)} />
      </div>
    </div>
  );
}
