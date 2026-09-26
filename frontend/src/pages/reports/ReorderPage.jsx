import { useApp, useData } from '../../lib/app-context';
import { api } from '../../lib/api';
import { CLASS_LABEL, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader } from '../../components/ui';

/** Required stock: materials whose actual stock (not expired) is at or below their reorder level. */
export default function ReorderPage() {
  const { location } = useApp();
  const { data, loading, error } = useData(() => api.get('/reports/reorder'), []);
  const columns = [
    { key: 'material_code', label: 'Material', value: (r) => `${r.material_code} - ${r.material_name}`, className: 'whitespace-normal min-w-[220px]' },
    { key: 'classification', label: 'Class', value: (r) => CLASS_LABEL[r.classification] || '' },
    { key: 'stock_qty', label: 'Stock', align: 'right', render: (r) => fmtQty(r.stock_qty), value: (r) => Number(r.stock_qty) },
    { key: 'reorder_level', label: 'Reorder Level', align: 'right', render: (r) => fmtQty(r.reorder_level), value: (r) => Number(r.reorder_level) },
    { key: 'to_order_qty', label: 'Required (below level by)', align: 'right', total: true,
      render: (r) => <span className="font-medium text-danger">{fmtQty(r.to_order_qty)}</span>, printValue: (r) => fmtQty(r.to_order_qty), value: (r) => Number(r.to_order_qty) },
    { key: 'uom', label: 'UOM' },
    { key: 'vendor_name', label: 'Vendor', value: (r) => r.vendor_name || '' },
  ];
  return (
    <div>
      <PageHeader title="Reorder Alerts"
        subtitle={`Required stock: materials at or below their reorder level · ${location ? location.code : 'All locations'}. Set the level on each material (Masters > Materials).`} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} rowKey="material_id" exportName="reorder_alerts"
          empty="No material is below its reorder level." onPrintAll={() => api.get('/reports/reorder', { scoped: false })} printTitle="Required Stock (Reorder Alerts)"
          printFilters={[['Location', location ? location.code : 'All locations']]} />
      </div>
    </div>
  );
}
