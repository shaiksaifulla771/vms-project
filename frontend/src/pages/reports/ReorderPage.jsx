import { useApp, useData } from '../../lib/app-context';
import { api } from '../../lib/api';
import { CLASS_LABEL, downloadCsv, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, PageHeader } from '../../components/ui';

const COLS = [
  { key: 'material_code', label: 'Material' }, { key: 'material_name', label: 'Name' }, { key: 'uom', label: 'UOM' },
  { key: 'stock_qty', label: 'Usable Stock' }, { key: 'plan_need_qty', label: 'Open Plans Need' }, { key: 'free_qty', label: 'Free' },
  { key: 'reorder_level', label: 'Reorder Level' }, { key: 'to_order_qty', label: 'Below Level By' }, { key: 'vendor_name', label: 'Vendor' },
];

/** Materials whose free stock (usable stock - open plan needs) is at or below their reorder level. */
export default function ReorderPage() {
  const { location } = useApp();
  const { data, loading, error } = useData(() => api.get('/reports/reorder'), []);
  return (
    <div>
      <PageHeader title="Reorder Alerts"
        subtitle={`Materials at or below their reorder level after open plans are covered · ${location ? location.code : 'All locations'}. Set the level on each material (Masters > Materials).`}
        actions={<button type="button" className="btn-secondary" onClick={() => downloadCsv('reorder_alerts.csv', COLS, data || [])}>CSV</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        {loading && <Loading />}
        {!loading && (data || []).length === 0 && <div className="text-ink-muted">No material is below its reorder level.</div>}
        {(data || []).length > 0 && (
          <div className="card overflow-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Material</th><th className="th">Class</th><th className="th text-right">Usable Stock</th>
                <th className="th text-right">Open Plans Need</th><th className="th text-right">Free</th><th className="th text-right">Reorder Level</th>
                <th className="th text-right">Below Level By</th><th className="th">UOM</th><th className="th">Vendor</th>
              </tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.material_id}>
                    <td className="td whitespace-normal">{r.material_code} - {r.material_name}</td>
                    <td className="td">{CLASS_LABEL[r.classification]}</td>
                    <td className="td num">{fmtQty(r.stock_qty)}</td>
                    <td className="td num">{r.plan_need_qty ? fmtQty(r.plan_need_qty) : '-'}</td>
                    <td className={`td num ${r.free_qty < 0 ? 'text-danger' : ''}`}>{fmtQty(r.free_qty)}</td>
                    <td className="td num">{fmtQty(r.reorder_level)}</td>
                    <td className="td num font-medium text-danger">{fmtQty(r.to_order_qty)}</td>
                    <td className="td">{r.uom}</td>
                    <td className="td">{r.vendor_name || <span className="text-ink-faint">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
