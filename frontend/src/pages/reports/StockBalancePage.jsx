import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { downloadCsv, fmtDate, fmtQty, mpnLabel } from '../../lib/format';
import { ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { PrintDialog, PrintHeader, printAfterRender } from '../../components/print';

const COLS = [
  { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) }, { key: 'material_name', label: 'Material Name' }, { key: 'lot_no', label: 'Lot No' },
  { key: 'quantity', label: 'Qty' }, { key: 'uom', label: 'UOM' }, { key: 'location_code', label: 'Location' },
  { key: 'warehouse_code', label: 'WH' }, { key: 'expiry_date', label: 'Expiry' },
];

export default function StockBalancePage() {
  const { location, warehouse } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [asOn, setAsOn] = useState('');
  const [cls, setCls] = useState('');
  const [ask, setAsk] = useState(false);
  const { data, loading, error } = useData(() => api.get(`/reports/stock-balance${qs({ as_on: asOn, classification: cls })}`), [asOn, cls]);
  const [printErr, setPrintErr] = useState(null);
  // Print: All = every lot today; Current filter = what is on screen; either can be "as on" a past date.
  const print = async (opt) => {
    setAsk(false);
    setPrintErr(null);
    const date = opt.asOn && opt.asOn !== today ? opt.asOn : '';
    const nextCls = opt.scope === 'all' ? '' : cls;
    try {
      if (date !== asOn || nextCls !== cls) {
        await api.get(`/reports/stock-balance${qs({ as_on: date, classification: nextCls })}`);  // surface errors before switching
        setAsOn(date); setCls(nextCls);
        setTimeout(() => printAfterRender(), 600);
      } else printAfterRender();
    } catch (e) { setPrintErr(e.message); }
  };
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
          <button type="button" className="btn-secondary" onClick={() => setAsk(true)}><Printer size={14} /> Print</button>
        </>} />
      <div className="p-5 space-y-4">
        <PrintHeader title="Stock Balance Sheet" filters={[['As on', asOn || `${today} (today)`],
          ['Location', location ? location.code : 'All locations'], ['Warehouse', warehouse?.code], ['Classification', cls.replace(/_/g, ' ')],
          ['Lots', String((data || []).length)]]} />
        <div className="card p-3 flex items-end gap-3 no-print">
          <Field label="Stock as on" hint="Blank = today">
            <input className="input w-44" type="date" max={today} value={asOn} onChange={(e) => setAsOn(e.target.value)} />
          </Field>
          <Field label="Classification">
            <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">All</option><option value="RAW_MATERIAL">Raw material</option><option value="PACKAGING">Packaging</option>
              <option value="CONSUMABLE">Consumable</option><option value="SEMI_FINISHED">Semi-finished</option><option value="FINISHED_GOOD">Finished good</option>
            </select>
          </Field>
          {(asOn || cls) && <button type="button" className="btn-link mb-2" onClick={() => { setAsOn(''); setCls(''); }}>Reset</button>}
        </div>
        <ErrorBox message={error || printErr} />
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
      {ask && <PrintDialog title="Stock Balance Sheet" dateMode="asOn" allowSelected={false} viewCount={(data || []).length}
        defaults={{ scope: cls ? 'view' : 'all', asOn: asOn || today }} onClose={() => setAsk(false)} onPrint={print} />}
    </div>
  );
}
