import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';

export default function BomsPage() {
  const { canWrite } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ACTIVE');
  const [cls, setCls] = useState('');
  const { data, loading, error } = useData(() => api.get(`/boms${qs({ status, classification: cls })}`), [status, cls]);
  const columns = [
    { key: 'bom_no', label: 'BOM ID' },
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}` },
    { key: 'name', label: 'BOM Name', render: (r) => (
      <span>{r.name || <span className="text-ink-faint">-</span>}{r.is_default && <span className="ml-2 text-xs2 px-1.5 py-0.5 rounded bg-accent-soft text-accent">Default</span>}</span>
    ), value: (r) => `${r.name || ''}${r.is_default ? ' (Default)' : ''}` },
    { key: 'classification', label: 'Type', value: (r) => CLASS_LABEL[r.product_classification] || '' },
    { key: 'location_code', label: 'Location' },
    { key: 'warehouse_code', label: 'WH' },
    { key: 'version', label: 'Version', align: 'right' },
    { key: 'batch_size', label: 'Batch Size', align: 'right', render: (r) => `${fmtQty(r.batch_size)} ${r.batch_uom}`, value: (r) => Number(r.batch_size) },
    { key: 'expected_output_qty', label: 'Expected Output', align: 'right', render: (r) => `${fmtQty(r.expected_output_qty)} ${r.output_uom}`, value: (r) => Number(r.expected_output_qty) },
    { key: 'line_count', label: 'Lines', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
  ];
  return (
    <div>
      <PageHeader title="Bill of Materials"
        subtitle="Recipes per product and location. A product can have several active BOMs; the Default is used unless you choose another."
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/boms/new')}><Plus size={14} /> New BOM</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="boms" printTitle="Bill of Materials"
          newField="created_at" onRowClick={(r) => navigate(`/masters/boms/${r.id}`)}
          toolbar={(
            <>
              <select className="input w-40" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Product type">
                <option value="">Finished and semi-finished</option>
                <option value="FINISHED_GOOD">Finished goods</option>
                <option value="SEMI_FINISHED">Semi-finished goods</option>
              </select>
              <select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="OBSOLETE">Obsolete</option>
              </select>
            </>
          )} />
      </div>
    </div>
  );
}
