import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { downloadCsv, fmtDate, fmtQty, mpnLabel } from '../../lib/format';
import { ErrorBox, Loading, PageHeader } from '../../components/ui';

const COLS = [
  { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) }, { key: 'material_name', label: 'Material Name' }, { key: 'lot_no', label: 'Lot No' },
  { key: 'quantity', label: 'Qty' }, { key: 'uom', label: 'UOM' }, { key: 'location_code', label: 'Location' },
  { key: 'warehouse_code', label: 'WH' }, { key: 'expiry_date', label: 'Expiry' },
];

export default function StockBalancePage() {
  const { location, warehouse, company } = useApp();
  const { data, loading, error } = useData(() => api.get('/reports/stock-balance'), []);
  const groups = useMemo(() => {
    const g = {};
    (data || []).forEach((r) => {
      const k = `${r.location_code} / ${r.warehouse_code}`;
      (g[k] || (g[k] = { name: `${r.location_name} / ${r.warehouse_name}`, rows: [] })).rows.push(r);
    });
    return Object.entries(g);
  }, [data]);

  return (
    <div>
      <PageHeader title="Stock Balance Sheet" subtitle={`Snapshot of current inventory grouped by Location / WH · ${location ? location.code : 'All locations'}${warehouse ? ` / ${warehouse.code}` : ''}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => downloadCsv('stock_balance.csv', COLS, data || [])}>CSV</button>
          <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print</button>
        </>} />
      <div className="p-5 space-y-4">
        <div className="print-only mb-2"><b>{company?.name}</b> · Stock Balance Sheet · {new Date().toLocaleString('en-IN')}</div>
        <ErrorBox message={error} />
        {loading && <Loading />}
        {!loading && groups.length === 0 && <div className="text-ink-muted">No stock</div>}
        {groups.map(([k, g]) => (
          <section key={k} className="card break-inside-avoid">
            <div className="flex justify-between px-3 py-2 border-b border-line">
              <span className="font-semibold">{k}</span>
              <span className="text-xs text-ink-muted">{g.name} · {g.rows.length} lots</span>
            </div>
            <table className="w-full">
              <thead><tr><th className="th">MPN</th><th className="th">Material Name</th><th className="th">Lot No</th><th className="th text-right">Qty</th><th className="th">UOM</th><th className="th">Expiry</th></tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={`${r.mpn_code}-${r.lot_no}`}>
                    <td className="td">{mpnLabel(r.mpn_code, r.classification)}</td><td className="td">{r.material_name}</td><td className="td">{r.lot_no}</td>
                    <td className="td num">{fmtQty(r.quantity)}</td><td className="td">{r.uom}</td>
                    <td className={`td ${r.is_expired ? 'text-danger' : ''}`}>{fmtDate(r.expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
