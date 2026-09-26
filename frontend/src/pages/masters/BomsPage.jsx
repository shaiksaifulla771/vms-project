import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtQty } from '../../lib/format';
import { ActionMenu, DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';
import { Combobox } from '../../components/pickers';
import { money, newBomUrl, useBomActions } from '../../components/bomKit';
import { usePersistedState } from '../../lib/usePersisted';

const ALL = '__all';
// Status filter: "current" = active and draft (a BOM saved as draft must not vanish from the list).
const STATUS_OPTIONS = [['CURRENT', 'Active and draft'], ['ACTIVE', 'Active'], ['DRAFT', 'Draft'], ['OBSOLETE', 'Obsolete'], ['', 'All statuses']];

/**
 * BOMs grouped by product. A product can have several BOMs per location (one Default per location).
 * Click a product to show its BOMs; each BOM has a ⋯ menu; "+ Add BOM" creates another for that product.
 */
export default function BomsPage() {
  const { canWrite, locations, locationId: scopeLoc } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = usePersistedState('boms.status2', 'CURRENT');
  const [cls, setCls] = usePersistedState('boms.cls', '');
  const [product, setProduct] = usePersistedState('boms.product', '');
  const [loc, setLoc] = usePersistedState('boms.location', '');
  const apiStatus = status === 'CURRENT' ? '' : status;
  const { data, loading, error, reload } = useData(
    () => api.get(`/boms${qs({ status: apiStatus, classification: cls, product_id: product, location_id: loc === ALL ? '' : loc })}`,
      { scoped: loc !== ALL }),
    [status, cls, product, loc]);
  const rows = (data || []).filter((b) => status !== 'CURRENT' || b.status !== 'OBSOLETE');
  // Product choices: every product that has a BOM (from an unfiltered list), so the filter never hides itself.
  const { data: all } = useData(() => api.get('/boms?cost=0', { scoped: false }), []);
  const productOptions = [...new Map((all || []).map((b) => [b.product_id, { value: b.product_id, label: `${b.product_code} - ${b.product_name}` }])).values()];
  const actions = useBomActions(reload);
  const addLoc = loc && loc !== ALL ? loc : scopeLoc;

  const columns = [
    { key: 'product', label: 'Product', value: (r) => `${r.product_code} - ${r.product_name}`, printFilter: true, hidden: true },
    { key: 'bom_no', label: 'BOM ID', render: (r) => <span className="font-medium text-accent">{r.bom_no}</span>, value: (r) => r.bom_no },
    { key: 'name', label: 'BOM Name', render: (r) => (
      <span>{r.name || <span className="text-ink-faint">-</span>}{r.is_default && <span className="ml-2 text-xs2 px-1.5 py-0.5 rounded bg-accent-soft text-accent">Default</span>}</span>
    ), value: (r) => `${r.name || ''}${r.is_default ? ' (Default)' : ''}` },
    { key: 'classification', label: 'Type', value: (r) => CLASS_LABEL[r.product_classification] || '', printFilter: true, hidden: true },
    { key: 'location_code', label: 'Location', printFilter: true, value: (r) => r.location_code, render: (r) => `${r.location_code} / ${r.warehouse_code}` },
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
    { key: '_actions', label: '', noSort: true, noPrint: true, noExport: true, width: 40,
      render: (r) => <ActionMenu label={`Actions for ${r.bom_no}`} items={actions.items(r)} /> },
  ];

  // Group header: how many BOMs, and the Default at each location.
  const summary = (list) => {
    const n = (s) => list.filter((b) => b.status === s).length;
    const counts = [[n('ACTIVE'), 'active'], [n('DRAFT'), 'draft'], [n('OBSOLETE'), 'obsolete']].filter(([c]) => c).map(([c, w]) => `${c} ${w}`).join(', ');
    const defaults = list.filter((b) => b.is_default && b.status === 'ACTIVE').map((b) => `${b.location_code}: ${b.bom_no}`);
    return `${counts}${defaults.length ? ` · Default ${defaults.join(', ')}` : ''}`;
  };

  return (
    <div>
      <PageHeader title="Bill of Materials"
        subtitle="Click a product to show its BOMs. A product can have several BOMs at each location; the Default is used unless another is chosen."
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/boms/new')}><Plus size={14} /> New BOM</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={rows} loading={loading} exportName="boms" printTitle="Bill of Materials"
          newField="created_at" groupBy={(r) => `${r.product_code} - ${r.product_name}`}
          collapsibleGroups groupSummary={summary}
          groupActions={canWrite ? (list) => (
            <button type="button" className="btn-link" onClick={() => navigate(newBomUrl(list[0].product_id, addLoc))}>
              <Plus size={13} /> Add BOM
            </button>
          ) : undefined}
          onPrintAll={() => api.get('/boms', { scoped: false })}
          onRowClick={(r) => navigate(`/masters/boms/${r.id}`)}
          empty={status === 'CURRENT' ? 'No BOMs here yet. Use New BOM, or change the location filter to All locations.' : 'No BOMs match these filters'}
          toolbar={(
            <>
              <div className="w-60"><Combobox value={product} onChange={setProduct} options={[{ value: '', label: 'All products' }, ...productOptions]} placeholder="All products" /></div>
              <select className="input w-44" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
                {scopeLoc && <option value="">Location from top bar</option>}
                <option value={scopeLoc ? ALL : ''}>All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
              </select>
              <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Product type">
                <option value="">Finished and semi-finished</option>
                <option value="FINISHED_GOOD">Finished goods</option>
                <option value="SEMI_FINISHED">Semi-finished goods</option>
              </select>
              <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                {STATUS_OPTIONS.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
              </select>
            </>
          )} />
      </div>
      {actions.dialogs}
    </div>
  );
}
