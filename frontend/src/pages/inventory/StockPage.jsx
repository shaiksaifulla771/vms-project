import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtQty, mpnLabel } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Stat } from '../../components/ui';
import { AdjustModal, InwardModal, OutwardModal, TransferModal } from './StockModals';

export default function StockPage() {
  const { canWrite, isAdmin, location, warehouse } = useApp();
  const navigate = useNavigate();
  const [cls, setCls] = useState('');
  const [showExpired, setShowExpired] = useState(true);
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(
    () => api.get(`/inventory/stock${qs({ classification: cls, expired: showExpired ? '' : 'false' })}`), [cls, showExpired]);
  const rows = data || [];

  const stats = useMemo(() => {
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const s = soon.toISOString().slice(0, 10);
    return {
      lots: rows.length,
      materials: new Set(rows.map((r) => r.material_id)).size,
      expired: rows.filter((r) => r.is_expired).length,
      expiring: rows.filter((r) => !r.is_expired && r.expiry_date && r.expiry_date <= s).length,
    };
  }, [rows]);

  const done = () => { setModal(null); reload(); };

  const columns = [
    { key: 'mpn_code', label: 'MPN', value: (r) => mpnLabel(r.mpn_code, r.classification) },
    { key: 'material_code', label: 'Material Code' },
    { key: 'material_name', label: 'Material Name', className: 'whitespace-normal min-w-[180px]' },
    { key: 'classification', label: 'Classification', render: (r) => CLASS_LABEL[r.classification], value: (r) => CLASS_LABEL[r.classification] },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'location_code', label: 'Location' },
    { key: 'warehouse_code', label: 'WH' },
    { key: 'lot_no', label: 'Lot No' },
    { key: 'quantity', label: 'Quantity', align: 'right', render: (r) => fmtQty(r.quantity), value: (r) => Number(r.quantity), total: true },
    { key: 'uom', label: 'UOM' },
    { key: 'mfg_date', label: 'Mfg Date', render: (r) => fmtDate(r.mfg_date) },
    { key: 'expiry_date', label: 'Expiry Date', render: (r) => <span className={r.is_expired ? 'text-danger' : ''}>{fmtDate(r.expiry_date)}{r.is_expired ? ' (expired)' : ''}</span> },
    ...(canWrite ? [{
      key: 'actions', label: '', noSort: true, noExport: true, render: (r) => (
        <span className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
          {!r.is_expired && <button type="button" className="btn-link" onClick={() => setModal({ type: 'out', lot: r })}>Outward</button>}
          <button type="button" className="btn-link" onClick={() => setModal({ type: 'transfer', lot: r })}>Transfer</button>
          {isAdmin && <button type="button" className="btn-link" onClick={() => setModal({ type: 'adjust', lot: r })}>Adjust</button>}
        </span>
      ),
    }] : []),
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
        <DataTable columns={columns} rows={rows} loading={loading} exportName="stock" printTitle="Stock" printDateKey="mfg_date"
          printFilters={[['Location', location ? location.code : 'All locations'], ['Warehouse', warehouse ? warehouse.code : '']]}
          empty="No stock for the selected location / warehouse"
          onRowClick={(r) => navigate(`/reports/traceability?mpn_id=${r.mpn_id}&lot_no=${encodeURIComponent(r.lot_no)}`)}
          toolbar={<>
            <select className="input w-44" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">All classifications</option>
              {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-ink-soft">
              <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} /> Show expired
            </label>
          </>} />
        <p className="text-xs text-ink-faint">Click a row to trace the lot. Stock changes only through Inward, Outward, Transfers, Adjustments and Manufacturing.</p>
      </div>
      {modal?.type === 'in' && <InwardModal onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'out' && <OutwardModal lot={modal.lot} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'adjust' && <AdjustModal lot={modal.lot} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'transfer' && <TransferModal lot={modal.lot} onClose={() => setModal(null)} onDone={() => { setModal(null); navigate('/inventory/transfers'); }} />}
    </div>
  );
}
