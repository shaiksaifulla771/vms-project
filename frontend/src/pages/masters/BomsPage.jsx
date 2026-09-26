import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';
import { Combobox } from '../../components/pickers';
import { usePersistedState } from '../../lib/usePersisted';

const money = (v) => (v === null || v === undefined ? '' : `₹ ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`);

/** BOMs grouped by product: every BOM with name, version, location, status, Default tag and cost per unit. */
export default function BomsPage() {
  const { canWrite, locations, locationId: scopeLoc } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = usePersistedState('boms.status', 'ACTIVE');
  const [cls, setCls] = usePersistedState('boms.cls', '');
  const [product, setProduct] = usePersistedState('boms.product', '');
  const [loc, setLoc] = usePersistedState('boms.location', '');
  const { data, loading, error } = useData(
    () => api.get(`/boms${qs({ status, classification: cls, product_id: product, location_id: loc })}`), [status, cls, product, loc]);
  // Product choices: every product that has a BOM (from an unfiltered list), so the filter never hides itself.
  const { data: all } = useData(() => api.get('/boms?cost=0', { scoped: false }), []);
  const productOptions = [...new Map((all || []).map((b) => [b.product_id, { value: b.product_id, label: `${b.product_code} - ${b.product_name}` }])).values()];

  const columns = [
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}`, printFilter: true, hidden: true },
    { key: 'bom_no', label: 'BOM ID', render: (r) => <span className="font-medium text-accent">{r.bom_no}</span>, value: (r) => r.bom_no },
    { key: 'name', label: 'BOM Name', render: (r) => (
      <span>{r.name || <span className="text-ink-faint">-</span>}{r.is_default && <span className="ml-2 text-xs2 px-1.5 py-0.5 rounded bg-accent-soft text-accent">Default</span>}</span>
    ), value: (r) => `${r.name || ''}${r.is_default ? ' (Default)' : ''}` },
    { key: 'classification', label: 'Type', value: (r) => CLASS_LABEL[r.product_classification] || '', printFilter: true },
    { key: 'location_code', label: 'Location', printFilter: true },
    { key: 'warehouse_code', label: 'WH' },
    { key: 'version', label: 'Version', align: 'right' },
    { key: 'batch_size', label: 'Batch Size', align: 'right', render: (r) => `${fmtQty(r.batch_size)} ${r.batch_uom}`, value: (r) => Number(r.batch_size) },
    { key: 'expected_output_qty', label: 'Expected Output', align: 'right', render: (r) => `${fmtQty(r.expected_output_qty)} ${r.output_uom}`, value: (r) => Number(r.expected_output_qty) },
    { key: 'cost_per_unit', label: 'Cost / Unit', align: 'right', value: (r) => (r.cost_per_unit == null ? null : Number(r.cost_per_unit)),
      render: (r) => (r.cost_per_unit == null ? <span className="text-ink-faint">-</span>
        : <span title={r.unpriced_lines ? `${r.unpriced_lines} ingredient(s) without a price` : ''}>{money(r.cost_per_unit)}{r.unpriced_lines ? ' *' : ''}</span>),
      printValue: (r) => (r.cost_per_unit == null ? '-' : `${money(r.cost_per_unit)}${r.unpriced_lines ? ' *' : ''}`) },
    { key: 'line_count', label: 'Lines', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status, printFilter: true },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
  ];
  return (
    <div>
      <PageHeader title="Bill of Materials"
        subtitle="Click a product to show its BOMs. * = some ingredients have no price yet."
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/boms/new')}><Plus size={14} /> New BOM</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="boms" printTitle="Bill of Materials"
          newField="created_at" initialSort={{ key: 'product', dir: 'asc' }} groupBy={(r) => `${r.product_code} - ${r.product_name}`}
          collapsibleGroups groupSummary={(list) => {
            const def = list.find((b) => b.is_default && b.status === 'ACTIVE') || list[0];
            return `Default ${def.bom_no} v${def.version}${def.cost_per_unit != null ? `, ${money(def.cost_per_unit)} / ${def.output_uom}` : ''}`;
          }}
          onPrintAll={() => api.get('/boms', { scoped: false })}
          onRowClick={(r) => navigate(`/masters/boms/${r.id}`)}
          toolbar={(
            <>
              <div className="w-60"><Combobox value={product} onChange={setProduct} options={[{ value: '', label: 'All products' }, ...productOptions]} placeholder="All products" /></div>
              <select className="input w-44" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
                <option value="">{scopeLoc ? 'Location from top bar' : 'All locations'}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
              </select>
              <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Product type">
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
