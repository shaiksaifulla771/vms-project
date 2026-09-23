import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';

export default function BomsPage() {
  const { canWrite } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ACTIVE');
  const { data, loading, error } = useData(() => api.get(`/boms${qs({ status })}`), [status]);
  const columns = [
    { key: 'bom_no', label: 'BOM ID' },
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}` },
    { key: 'location_code', label: 'Location' },
    { key: 'warehouse_code', label: 'WH' },
    { key: 'version', label: 'Version', align: 'right' },
    { key: 'batch_size', label: 'Batch Size', align: 'right', render: (r) => `${fmtQty(r.batch_size)} ${r.batch_uom}`, value: (r) => Number(r.batch_size) },
    { key: 'expected_output_qty', label: 'Expected Output', align: 'right', render: (r) => `${fmtQty(r.expected_output_qty)} ${r.output_uom}`, value: (r) => Number(r.expected_output_qty) },
    { key: 'line_count', label: 'Lines', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Bill of Materials" subtitle="Versioned recipes scoped to Location + WH. One ACTIVE BOM per product and location."
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/boms/new')}><Plus size={14} /> New BOM</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="boms" onRowClick={(r) => navigate(`/masters/boms/${r.id}`)}
          toolbar={(
            <select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option><option>ACTIVE</option><option>DRAFT</option><option>OBSOLETE</option>
            </select>
          )} />
      </div>
    </div>
  );
}
