import { useApp, useData } from '../../lib/app-context';
import { api } from '../../lib/api';
import { fmtDate, fmtQty, mpnLabel } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader } from '../../components/ui';
import { usePersistedState } from '../../lib/usePersisted';

/**
 * Physical Stock Sheet (spec Workflow 5): a printable list for warehouse staff - MPN, lot, system qty,
 * and blank Physical Qty / Variance columns to fill in on paper. To enter the counts and post the
 * differences, start a Physical Stock Count instead.
 */
export default function PhysicalSheetPage() {
  const { location, warehouse } = useApp();
  const [hideSystem, setHideSystem] = usePersistedState('sheet.hideSystem', false);
  const { data, loading, error } = useData(() => api.get('/reports/physical-stock-sheet'), []);
  const blank = { render: () => '', printValue: () => '', noExport: false };
  const columns = [
    { key: 'location', label: 'Location / WH', value: (r) => `${r.location_code} / ${r.warehouse_code}`, printFilter: true },
    { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) },
    { key: 'material', label: 'Material', value: (r) => `${r.material_code} - ${r.material_name}`, printFilter: true, className: 'whitespace-normal min-w-[200px]' },
    { key: 'lot_no', label: 'Lot No' },
    { key: 'expiry_date', label: 'Expiry', render: (r) => fmtDate(r.expiry_date), value: (r) => r.expiry_date || '' },
    ...(hideSystem ? [] : [{ key: 'system_qty', label: 'System Qty', align: 'right', render: (r) => fmtQty(r.system_qty), value: (r) => Number(r.system_qty) }]),
    { key: 'uom', label: 'UOM' },
    { key: 'physical', label: 'Physical Qty', ...blank, value: () => '' },
    { key: 'variance', label: 'Variance', ...blank, value: () => '' },
    { key: 'checked_by', label: 'Checked by', ...blank, value: () => '' },
  ];
  return (
    <div>
      <PageHeader title="Physical Stock Sheet"
        subtitle={`Printable count sheet for warehouse staff · ${location ? location.code : 'All locations'}${warehouse ? ` / ${warehouse.code}` : ''}. To enter counts and post differences, use Inventory > Physical Stock Count.`} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} rowKey="inventory_id" exportName="physical_stock_sheet"
          printTitle="Physical Stock Sheet" onPrintAll={() => api.get('/reports/physical-stock-sheet', { scoped: false })} initialSort={{ key: 'location', dir: 'asc' }}
          printFilters={[['Location', location ? location.code : 'All locations'], ['Warehouse', warehouse?.code], ['System qty', hideSystem ? 'hidden (blind count)' : 'shown']]}
          toolbar={(
            <label className="flex items-center gap-1.5 text-ink-soft">
              <input type="checkbox" checked={hideSystem} onChange={(e) => setHideSystem(e.target.checked)} /> Hide system qty (blind count)
            </label>
          )} />
      </div>
    </div>
  );
}
