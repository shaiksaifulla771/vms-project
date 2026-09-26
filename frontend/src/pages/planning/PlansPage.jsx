import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';
import { usePersistedState } from '../../lib/usePersisted';

export default function PlansPage() {
  const { canWrite, locations, locationId: scopeLoc } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = usePersistedState('plans.status', '');
  // Location filter: empty = follow the location chosen in the top bar.
  const [loc, setLoc] = usePersistedState('plans.location', '');
  const { data, loading, error } = useData(() => api.get(`/plans${qs({ status, location_id: loc })}`), [status, loc]);
  const locCode = (id) => locations.find((l) => l.id === id)?.code;
  const columns = [
    { key: 'plan_no', label: 'Plan ID' },
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}`, printFilter: true },
    { key: 'location_code', label: 'Location', printFilter: true },
    { key: 'bom', label: 'BOM', value: (r) => `${r.bom_no} v${r.bom_version}` },
    { key: 'target_qty', label: 'Target Qty', align: 'right', render: (r) => fmtQty(r.target_qty), value: (r) => Number(r.target_qty), total: 'uom' },
    { key: 'executed_qty', label: 'Executed Qty', align: 'right', render: (r) => fmtQty(r.executed_qty), value: (r) => Number(r.executed_qty), total: 'uom' },
    { key: 'remaining_qty', label: 'Remaining Qty', align: 'right', render: (r) => fmtQty(r.remaining_qty), value: (r) => Number(r.remaining_qty), total: 'uom' },
    { key: 'output_uom', label: 'UOM' },
    { key: 'plan_mode', label: 'Plan By', value: (r) => (r.plan_mode === 'BATCHES' ? 'Batches' : 'Quantity') },
    { key: 'batch_count', label: 'Batches Done / Planned', align: 'right', value: (r) => r.batch_count, render: (r) => `${r.batch_count} / ${r.planned_batches ?? '-'}` },
    { key: 'remaining_batches', label: 'Remaining Batches', align: 'right', value: (r) => Math.max((r.planned_batches || 0) - r.batch_count, 0) },
    { key: 'required_date', label: 'Required By', render: (r) => fmtDate(r.required_date) },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, printValue: (r) => r.status.replace('_', ' '), value: (r) => r.status, printFilter: true },
  ];
  return (
    <div>
      <PageHeader title="Production Plans"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/planning/new')}><Plus size={14} /> New Plan</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="plans" printTitle="Production Plans" printDateKey="created_at"
          onPrintAll={() => api.get('/plans', { scoped: false })}
          printFilters={[['Location', loc ? locCode(loc) : (scopeLoc ? locCode(scopeLoc) : 'All locations')]]}
          onRowClick={(r) => navigate(`/planning/plans/${r.id}`)}
          toolbar={(
            <>
              <select className="input w-48" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
                <option value="">{scopeLoc ? 'Location from top bar' : 'All locations'}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
              </select>
              <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">All statuses</option>
                {['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
              </select>
            </>
          )} />
      </div>
    </div>
  );
}
