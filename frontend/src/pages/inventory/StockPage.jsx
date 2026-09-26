import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, CLASS_SHORT, fmtDate, fmtQty, mpnLabel, today } from '../../lib/format';
import { ActionMenu, DataTable, ErrorBox, PageHeader, Stat } from '../../components/ui';
import { AdjustModal, InwardModal, OutwardModal, TransferModal } from './StockModals';
import { usePersistedState } from '../../lib/usePersisted';


export default function StockPage() {
  const { canWrite, isAdmin, location, warehouse } = useApp();
  const navigate = useNavigate();
  const [cls, setCls] = usePersistedState('stock.cls', '');
  const [showExpired, setShowExpired] = usePersistedState('stock.showExpired', true);
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(
    () => api.get(`/inventory/stock${qs({ classification: cls, expired: showExpired ? '' : 'false' })}`), [cls, showExpired]);
  const rows = data || [];

  const stats = useMemo(() => {
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const s = soon.toLocaleDateString('en-CA');
    return {
      lots: rows.length,
      materials: new Set(rows.map((r) => r.material_id)).size,
      expired: rows.filter((r) => r.is_expired).length,
      expiring: rows.filter((r) => !r.is_expired && r.expiry_date && r.expiry_date <= s).length,
    };
  }, [rows]);

  const done = () => { setModal(null); reload(); };

  // Screen: one line per lot (9 compact columns). Print / CSV keep every field (the hidden: true columns).
  const trace = (r) => navigate(`/reports/traceability?mpn_id=${r.mpn_id}&lot_no=${encodeURIComponent(r.lot_no)}`);
  const columns = [
    { key: 'material', label: 'Material', noPrint: true, noExport: true, value: (r) => `${r.material_code} ${r.material_name}`,
      render: (r) => (
        <span className="block max-w-[300px] truncate" title={`${r.material_code} - ${r.material_name}${r.vendor_name ? `\nVendor: ${r.vendor_name}` : ''}`}>
          <span className="font-medium text-ink">{r.material_code}</span> <span className="text-ink-soft">{r.material_name}</span>
        </span>
      ) },
    { key: 'mpn', label: 'MPN', noPrint: true, noExport: true, value: (r) => (r.classification === 'FINISHED_GOOD' ? 'In-house' : r.mpn_code || '') },
    { key: 'type', label: 'Type', noPrint: true, noExport: true, value: (r) => CLASS_SHORT[r.classification] || '',
      render: (r) => <span title={CLASS_LABEL[r.classification]}>{CLASS_SHORT[r.classification]}</span> },
    { key: 'lot', label: 'Lot', noPrint: true, noExport: true, value: (r) => r.lot_no },
    { key: 'place', label: 'Loc / WH', noPrint: true, noExport: true, value: (r) => `${r.location_code} / ${r.warehouse_code}` },
    { key: 'qty', label: 'Qty', align: 'right', noPrint: true, noExport: true, value: (r) => Number(r.quantity),
      render: (r) => <>{fmtQty(r.quantity)} <span className="text-ink-muted">{r.uom}</span></> },
    { key: 'mfg', label: 'Mfg', noPrint: true, noExport: true, value: (r) => r.mfg_date || '', render: (r) => fmtDate(r.mfg_date) },
    { key: 'exp', label: 'Expiry', noPrint: true, noExport: true, value: (r) => r.expiry_date || '',
      render: (r) => <span className={r.is_expired ? 'text-danger' : ''} title={r.is_expired ? 'Expired' : undefined}>{fmtDate(r.expiry_date)}{r.is_expired ? ' exp.' : ''}</span> },
    { key: '_actions', label: '', noSort: true, noPrint: true, noExport: true, width: 40, render: (r) => (
      <ActionMenu label={`Actions for lot ${r.lot_no}`} items={[
        { label: 'Outward', onClick: () => setModal({ type: 'out', lot: r }), hidden: !canWrite || r.is_expired },
        { label: 'Transfer', onClick: () => setModal({ type: 'transfer', lot: r }), hidden: !canWrite },
        { label: 'Adjust', onClick: () => setModal({ type: 'adjust', lot: r }), hidden: !isAdmin },
        { label: 'Trace lot', onClick: () => trace(r) },
      ]} />
    ) },
    // Full detail for paper and CSV (not on screen).
    { key: 'mpn_code', label: 'MPN', hidden: true, value: (r) => mpnLabel(r.mpn_code, r.classification) },
    { key: 'material_code', label: 'Material Code', hidden: true },
    { key: 'material_name', label: 'Material Name', hidden: true, printFilter: true },
    { key: 'classification', label: 'Classification', hidden: true, value: (r) => CLASS_LABEL[r.classification], printFilter: true },
    { key: 'vendor_name', label: 'Vendor', hidden: true, printFilter: true },
    { key: 'location_code', label: 'Location', hidden: true, printFilter: true },
    { key: 'warehouse_code', label: 'WH', hidden: true, printFilter: true },
    { key: 'lot_no', label: 'Lot No', hidden: true },
    { key: 'quantity', label: 'Quantity', align: 'right', hidden: true, value: (r) => Number(r.quantity), printValue: (r) => fmtQty(r.quantity), total: 'uom' },
    { key: 'uom', label: 'UOM', hidden: true },
    { key: 'mfg_date', label: 'Mfg Date', hidden: true, value: (r) => fmtDate(r.mfg_date) },
    { key: 'expiry_date', label: 'Expiry Date', hidden: true, value: (r) => `${fmtDate(r.expiry_date)}${r.is_expired ? ' (expired)' : ''}` },
  ];

  return (
    <div>
      <PageHeader title="Stock"
        subtitle={`Centralized inventory · ${location ? `${location.code} - ${location.name}` : 'All locations'}${warehouse ? ` / ${warehouse.code}` : ''}`}
        actions={canWrite && <>
          <button type="button" className="btn-secondary" onClick={() => setModal({ type: 'out' })}><Minus size={14} /> Outward</button>
          <button type="button" className="btn-primary" onClick={() => setModal({ type: 'in' })}><Plus size={14} /> Inward</button>
        </>} />
      <div className="flex border-b border-line bg-white">
        <Stat label="Lots" value={stats.lots} />
        <Stat label="Materials" value={stats.materials} />
        <Stat label="Expiring in 30 days" value={stats.expiring} />
        <Stat label="Expired lots" value={stats.expired} />
      </div>
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={rows} loading={loading} exportName="stock" printTitle="Stock" printDateMode="asOn"
          printMatch={(r) => `${r.material_name}|${r.lot_no}|${r.location_code}|${r.warehouse_code}`}
          // Printing "as on" a past day rebuilds each lot's balance from the audit ledger.
          onPrintAll={(opt) => (opt.asOn && opt.asOn !== today()
            ? api.get(`/reports/stock-balance${qs({ as_on: opt.asOn })}`, { scoped: false })
            : api.get('/inventory/stock', { scoped: false }))}
          onPrintView={(opt) => (opt.asOn && opt.asOn !== today()
            ? api.get(`/reports/stock-balance${qs({ as_on: opt.asOn, classification: cls })}`) : null)}
          printFilters={[['Location', location ? location.code : 'All locations'], ['Warehouse', warehouse ? warehouse.code : '']]}
          empty="No stock for the selected location / warehouse"
          onRowClick={trace}
          toolbar={<>
            <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">All classifications</option>
              {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-ink-soft">
              <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} /> Show expired
            </label>
          </>} />
        <p className="text-xs text-ink-muted">Click a row to trace the lot. Stock changes only through Inward, Outward, Transfers, Adjustments and Manufacturing.</p>
      </div>
      {modal?.type === 'in' && <InwardModal onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'out' && <OutwardModal lot={modal.lot} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'adjust' && <AdjustModal lot={modal.lot} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'transfer' && <TransferModal lot={modal.lot} onClose={() => setModal(null)} onDone={() => { setModal(null); navigate('/inventory/transfers'); }} />}
    </div>
  );
}
