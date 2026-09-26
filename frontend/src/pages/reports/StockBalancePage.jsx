import { useMemo, useState } from 'react';
import { CheckSquare, Download, Printer } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, downloadCsv, fmtDate, fmtQty, mpnLabel, today } from '../../lib/format';
import { usePersistedState } from '../../lib/usePersisted';
import { ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { PrintDialog, PrintHeader, printAfterRender } from '../../components/print';

const COLS = [
  { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) }, { key: 'material_name', label: 'Material Name' }, { key: 'lot_no', label: 'Lot No' },
  { key: 'quantity', label: 'Qty' }, { key: 'uom', label: 'UOM' }, { key: 'location_code', label: 'Location' },
  { key: 'warehouse_code', label: 'WH' }, { key: 'expiry_date', label: 'Expiry' },
];

/** Quantities can only be added within one unit: returns [[uom, total]] sorted by uom. */
const uomTotals = (rows) => Object.entries(rows.reduce((t, r) => ({ ...t, [r.uom]: (t[r.uom] || 0) + Number(r.quantity) }), {}))
  .sort(([a], [b]) => a.localeCompare(b));

export default function StockBalancePage() {
  const { location, warehouse } = useApp();
  const todayStr = today();
  const [asOn, setAsOn] = usePersistedState('balance.asOn', '');
  const [cls, setCls] = usePersistedState('balance.cls', '');
  const [ask, setAsk] = useState(false);
  const { data, loading, error } = useData(() => api.get(`/reports/stock-balance${qs({ as_on: asOn, classification: cls })}`), [asOn, cls]);
  const [printErr, setPrintErr] = useState(null);
  const [printing, setPrinting] = useState(null);          // { rows, filters } while the print window is open
  const [optRows, setOptRows] = useState(null);            // every lot in every location, for the dialog's filters
  const openPrint = async () => {
    setAsk(true);
    if (!optRows) { try { setOptRows(await api.get('/reports/stock-balance', { scoped: false })); } catch { /* choices fall back to the screen */ } }
  };
  const pickList = (f) => [...new Set([...(data || []), ...(optRows || [])].map(f).filter(Boolean))].sort();
  const fields = [
    { key: 'location', label: 'Location', values: pickList((r) => `${r.location_code} / ${r.warehouse_code}`) },
    { key: 'classification', label: 'Type', values: pickList((r) => CLASS_LABEL[r.classification]) },
    { key: 'material', label: 'Material', values: pickList((r) => r.material_name) },
  ];
  // Print: All = every location; Current filter = top-bar location + classification. Either can be "as on" a past date.
  // The screen's own filters are left as they are.
  const print = async (opt) => {
    setAsk(false);
    setPrintErr(null);
    const date = opt.asOn && opt.asOn !== todayStr ? opt.asOn : '';
    const all = opt.scope === 'all';
    try {
      let rows = await api.get(`/reports/stock-balance${qs({ as_on: date, classification: all ? '' : cls })}`, { scoped: !all });
      const f = opt.fields || {};
      if (f.location) rows = rows.filter((r) => `${r.location_code} / ${r.warehouse_code}` === f.location);
      if (f.classification) rows = rows.filter((r) => CLASS_LABEL[r.classification] === f.classification);
      if (f.material) rows = rows.filter((r) => r.material_name === f.material);
      setPrinting({ rows, filters: [['Printed', all ? 'All records' : 'Current filter'], ['As on', date || `${todayStr} (today)`],
        ['Location', f.location || (all ? 'All locations' : (location ? location.code : 'All locations'))], ['Warehouse', all || f.location ? '' : warehouse?.code],
        ['Type', f.classification || (all ? '' : cls.replace(/_/g, ' '))], ['Material', f.material], ['Lots', String(rows.length)]] });
      printAfterRender(() => setPrinting(null));
    } catch (e) { setPrintErr(e.message); }
  };
  // Select mode: tick lots, then print or download only those.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const rowKey = (r) => `${r.location_code}|${r.warehouse_code}|${r.mpn_code || r.material_name}|${r.lot_no}`;
  const pickedRows = (data || []).filter((r) => picked.has(rowKey(r)));
  const toggle = (r) => setPicked((s) => { const n = new Set(s); const k = rowKey(r); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  const printPicked = () => {
    setPrinting({ rows: pickedRows, filters: [['Printed', 'Selected rows'], ['As on', asOn || `${todayStr} (today)`], ['Lots', String(pickedRows.length)]] });
    printAfterRender(() => setPrinting(null));
  };
  const list = printing ? printing.rows : data;
  const groups = useMemo(() => {
    const g = {};
    (list || []).forEach((r) => {
      const k = `${r.location_code} / ${r.warehouse_code}`;
      (g[k] || (g[k] = { name: `${r.location_name} / ${r.warehouse_name}`, rows: [] })).rows.push(r);
    });
    return Object.entries(g);
  }, [list]);

  return (
    <div>
      <PageHeader title="Stock Balance Sheet" subtitle={`Snapshot of current inventory grouped by Location / WH · ${location ? location.code : 'All locations'}${warehouse ? ` / ${warehouse.code}` : ''}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => downloadCsv('stock_balance.csv', COLS, data || [])}>CSV</button>
          <button type="button" className="btn-secondary" onClick={openPrint}><Printer size={14} /> Print</button>
        </>} />
      <div className="p-5 space-y-4">
        <PrintHeader title="Stock Balance Sheet" filters={printing ? printing.filters : [['As on', asOn || `${todayStr} (today)`],
          ['Location', location ? location.code : 'All locations'], ['Warehouse', warehouse?.code], ['Classification', cls.replace(/_/g, ' ')],
          ['Lots', String((data || []).length)]]} />
        <div className="card p-3 flex items-end gap-3 no-print">
          <Field label="Stock as on" hint="Blank = today">
            <input className="input w-44" type="date" max={todayStr} value={asOn} onChange={(e) => setAsOn(e.target.value)} />
          </Field>
          <Field label="Classification">
            <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">All</option><option value="RAW_MATERIAL">Raw material</option><option value="PACKAGING">Packaging</option>
              <option value="CONSUMABLE">Consumable</option><option value="SEMI_FINISHED">Semi-finished</option><option value="FINISHED_GOOD">Finished good</option>
            </select>
          </Field>
          {(asOn || cls) && <button type="button" className="btn-link mb-2" onClick={() => { setAsOn(''); setCls(''); }}>Reset</button>}
          {!selecting && (data || []).length > 0 && (
            <button type="button" className="btn-link mb-2 ml-auto" onClick={() => setSelecting(true)}><CheckSquare size={13} /> Select</button>
          )}
        </div>
        {selecting && (
          <div className="card flex flex-wrap items-center gap-3 px-3 py-1.5 bg-accent-soft text-[13px] no-print" role="toolbar" aria-label="Selected rows">
            <span className="font-medium text-ink">{pickedRows.length} selected</span>
            <button type="button" className="btn-link" onClick={() => setPicked(pickedRows.length === (data || []).length ? new Set() : new Set((data || []).map(rowKey)))}>
              {pickedRows.length === (data || []).length ? 'Clear all' : `Select all ${(data || []).length}`}
            </button>
            <span className="ml-auto flex items-center gap-3">
              <button type="button" className="btn-link" disabled={!pickedRows.length} onClick={printPicked}><Printer size={13} /> Print</button>
              <button type="button" className="btn-link" disabled={!pickedRows.length} onClick={() => downloadCsv('stock_balance_selected.csv', COLS, pickedRows)}><Download size={13} /> Download CSV</button>
              <button type="button" className="btn-link text-ink-soft" onClick={stopSelecting}>Cancel</button>
            </span>
          </div>
        )}
        <ErrorBox message={error || printErr} />
        {loading && !printing && <Loading />}
        {!loading && !printing && groups.length === 0 && <div className="text-ink-muted">No stock</div>}
        {groups.map(([k, g]) => (
          <section key={k} className="card break-inside-avoid">
            <div className="flex justify-between px-3 py-2 border-b border-line">
              <span className="font-semibold">{k}</span>
              <span className="text-xs text-ink-muted">{g.name} · {g.rows.length} lots</span>
            </div>
            <table className="w-full">
              <thead><tr>{selecting && !printing && <th className="th w-8 no-print" />}<th className="th">MPN</th><th className="th">Material Name</th><th className="th">Lot No</th><th className="th text-right">Qty</th><th className="th">UOM</th><th className="th">Expiry</th></tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={`${r.mpn_code}-${r.lot_no}`}>
                    {selecting && !printing && (
                      <td className="td w-8 no-print"><input type="checkbox" aria-label={`Select lot ${r.lot_no}`} checked={picked.has(rowKey(r))} onChange={() => toggle(r)} /></td>
                    )}
                    <td className="td">{mpnLabel(r.mpn_code, r.classification)}</td><td className="td">{r.material_name}</td><td className="td">{r.lot_no}</td>
                    <td className="td num">{fmtQty(r.quantity)}</td><td className="td">{r.uom}</td>
                    <td className={`td ${r.is_expired ? 'text-danger' : ''}`}>{fmtDate(r.expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-panel font-medium">
                <td className="td" colSpan={selecting && !printing ? 4 : 3}>Total · {g.rows.length} lots</td>
                <td className="td num">{uomTotals(g.rows).map(([u, q]) => <div key={u}>{fmtQty(q)}</div>)}</td>
                <td className="td">{uomTotals(g.rows).map(([u]) => <div key={u}>{u}</div>)}</td>
                <td className="td" />
              </tr></tfoot>
            </table>
          </section>
        ))}
      </div>
      {ask && <PrintDialog title="Stock Balance Sheet" dateMode="asOn" allowSelected={false} fields={fields}
        defaults={{ scope: cls ? 'view' : 'all', asOn: asOn || todayStr }} onClose={() => setAsk(false)} onPrint={print} />}
    </div>
  );
}
