import { useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, PageHeader } from '../../components/ui';

/**
 * Printable physical stock sheet: MPN, Lot No, System Qty, Physical Qty (blank), Variance.
 * Admins can type counted quantities here and post adjustments directly.
 */
export default function PhysicalSheetPage() {
  const { location, warehouse, company, isAdmin, notify } = useApp();
  const { data, loading, error, reload } = useData(() => api.get('/reports/physical-stock-sheet'), []);
  const [counts, setCounts] = useState({});
  const [err, setErr] = useState(null);

  const post = async () => {
    setErr(null);
    const entries = Object.entries(counts).filter(([, v]) => v !== '');
    const rows = (data || []).filter((r) => entries.some(([k]) => k === r.inventory_id));
    try {
      let n = 0;
      for (const r of rows) {
        const physical = Number(counts[r.inventory_id]);
        if (physical !== Number(r.system_qty)) {
          await api.post('/inventory/adjustments', { inventory_id: r.inventory_id, new_physical_qty: physical, reason: 'Physical stock count' });
          n += 1;
        }
      }
      notify(`${n} adjustment(s) posted`);
      setCounts({});
      reload();
    } catch (e) { setErr(e.message); reload(); }
  };

  return (
    <div>
      <PageHeader title="Physical Stock Sheet" subtitle={`For warehouse counting · ${location ? location.code : 'All locations'}${warehouse ? ` / ${warehouse.code}` : ''}`}
        actions={<>
          {isAdmin && <button type="button" className="btn-secondary" disabled={!Object.values(counts).some((v) => v !== '')} onClick={post}>Post Adjustments</button>}
          <button type="button" className="btn-primary" onClick={() => window.print()}><Printer size={14} /> Print</button>
        </>} />
      <div className="p-5 space-y-3">
        <div className="print-only">
          <div className="text-[15px] font-semibold">{company?.name} - Physical Stock Sheet</div>
          <div>Location / WH: {location ? `${location.code} - ${location.name}` : 'All'}{warehouse ? ` / ${warehouse.code}` : ''} · Printed {new Date().toLocaleString('en-IN')}</div>
          <div className="mt-1">Counted by: ____________________ Date: ____________ Verified by: ____________________</div>
        </div>
        <ErrorBox message={err || error} onClose={() => setErr(null)} />
        {loading ? <Loading /> : (
          <table className="w-full card">
            <thead><tr>
              <th className="th w-10">#</th><th className="th">Location / WH</th><th className="th">MPN</th><th className="th">Material</th><th className="th">Lot No</th>
              <th className="th">Expiry</th><th className="th text-right">System Qty</th><th className="th">UOM</th>
              <th className="th text-right w-36">Physical Qty</th><th className="th text-right w-28">Variance</th>
            </tr></thead>
            <tbody>
              {(data || []).map((r, i) => {
                const c = counts[r.inventory_id];
                const v = c === undefined || c === '' ? null : Number(c) - Number(r.system_qty);
                return (
                  <tr key={r.inventory_id}>
                    <td className="td">{i + 1}</td>
                    <td className="td">{r.location_code} / {r.warehouse_code}</td>
                    <td className="td">{r.mpn_code}</td>
                    <td className="td">{r.material_name}</td>
                    <td className="td">{r.lot_no}</td>
                    <td className="td">{fmtDate(r.expiry_date)}</td>
                    <td className="td num">{fmtQty(r.system_qty)}</td>
                    <td className="td">{r.uom}</td>
                    <td className="td">
                      <input className="input num no-print" type="number" min="0" step="any" value={c ?? ''}
                        onChange={(e) => setCounts({ ...counts, [r.inventory_id]: e.target.value })} disabled={!isAdmin} />
                      <span className="print-only border-b border-ink h-5">&nbsp;</span>
                    </td>
                    <td className={`td num ${v ? 'text-danger' : ''}`}>{v === null ? '' : `${v > 0 ? '+' : ''}${fmtQty(v)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
