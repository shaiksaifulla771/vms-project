import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';
import { DeleteDialog, actionsColumn } from '../../components/masterKit';
import { usePersistedState } from '../../lib/usePersisted';

const money = (v) => (v === null || v === undefined ? '-' : `₹ ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`);
const TYPE = { FINISHED_GOOD: 'FG', SEMI_FINISHED: 'SFG' };

export default function ProductsPage() {
  const { canWrite, location } = useApp();
  const navigate = useNavigate();
  const [type, setType] = usePersistedState('products.type', '');
  const [status, setStatus] = usePersistedState('products.status', '');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get(`/products${qs({ classification: type, status })}`), [type, status]);
  const close = () => setModal(null);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Product Name', className: 'whitespace-normal min-w-[200px]' },
    { key: 'classification', label: 'Type', value: (r) => TYPE[r.classification], printFilter: true },
    { key: 'category_name', label: 'Category', printFilter: true },
    { key: 'uom', label: 'UOM' },
    { key: 'active_boms', label: 'Active BOMs', value: (r) => r.active_boms.map((x) => `${x.location_code} v${x.version}`).join(', ') || '-' },
    { key: 'batch', label: `Batch → Output${location ? ` (${location.code})` : ''}`, value: (r) => (r.bom_in_scope
      ? `${fmtQty(r.bom_in_scope.batch_size)} ${r.bom_in_scope.batch_uom} → ${fmtQty(r.bom_in_scope.expected_output_qty)} ${r.bom_in_scope.output_uom}` : '-') },
    { key: 'cost_per_unit', label: 'Cost / Unit', align: 'right', render: (r) => (r.bom_in_scope ? money(r.cost_per_unit) : '-'), value: (r) => Number(r.cost_per_unit ?? 0) },
    { key: 'stock_qty', label: 'Stock', align: 'right', render: (r) => `${fmtQty(r.stock_qty)} ${r.uom}`, value: (r) => Number(r.stock_qty) },
    { key: 'open_plans', label: 'Open Plans', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status, printFilter: true },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
    actionsColumn({
      canWrite,
      onView: (r) => navigate(`/masters/products/${r.id}`),
      onEdit: (r) => navigate(`/masters/products/${r.id}/edit`),
      onDelete: (r) => setModal({ type: 'delete', row: r }),
    }),
  ];

  return (
    <div>
      <PageHeader title="Products" subtitle={`Finished and semi-finished goods with their BOM, cost, stock and plans${location ? ` · ${location.code}` : ' · all locations'}`}
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/products/new')}><Plus size={14} /> New Product</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="products" newField="created_at"
          onRowClick={(r) => navigate(`/masters/products/${r.id}`)} printTitle="Products"
          onPrintAll={() => api.get('/products', { scoped: false })}
          toolbar={<>
            <select className="input w-44" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Finished + Semi-Finished</option>
              <option value="FINISHED_GOOD">Finished Good</option><option value="SEMI_FINISHED">Semi-Finished</option>
            </select>
            <select className="input w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            </select>
          </>} />
      </div>
      {modal?.type === 'delete' && <DeleteDialog label={`${modal.row.code} ${modal.row.name}`} path={`/materials/${modal.row.id}`} onClose={close}
        onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}
