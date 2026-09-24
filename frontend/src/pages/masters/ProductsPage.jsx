import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, fmtDate, fmtQty } from '../../lib/format';
import { DataTable, ErrorBox, Modal, PageHeader, Status } from '../../components/ui';
import { DeleteDialog, DetailGrid, actionsColumn } from '../../components/masterKit';
import { MaterialForm } from './MaterialsPage';

const money = (v) => (v === null || v === undefined ? '-' : `₹ ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`);
const TYPE = { FINISHED_GOOD: 'FG', SEMI_FINISHED: 'SFG' };

function ProductView({ id, canWrite, onClose, onEdit }) {
  const navigate = useNavigate();
  const { data: p, error } = useData(() => api.get(`/products/${id}`), [id]);
  const b = p?.bom_in_scope;
  return (
    <Modal title={p ? `${p.code} - ${p.name}` : 'Product'} onClose={onClose} width="max-w-4xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        {canWrite && p && <button type="button" className="btn-secondary" onClick={() => navigate(`/masters/boms/new?product_id=${p.id}`)}>Create BOM</button>}
        {canWrite && p && <button type="button" className="btn-primary" onClick={() => onEdit(p)}>Edit</button>}
      </>}>
      <ErrorBox message={error} />
      {p && (
        <div className="space-y-4">
          <DetailGrid items={[
            ['Product Code', p.code], ['Product Name', p.name, 'col-span-2'],
            ['Type', CLASS_LABEL[p.classification]], ['Category', p.category_name], ['Sub-category', p.sub_category_name],
            ['UOM', p.uom], ['Shelf Life (days)', p.shelf_life_days], ['Status', <Status key="s" value={p.status} />],
            ['MPN', p.classification === 'FINISHED_GOOD' ? 'None (made in-house)' : p.mpn_code], ['Stock (selected scope)', `${fmtQty(p.stock_qty)} ${p.uom}`],
            ['Cost per unit (active BOM)', b ? money(p.cost_per_unit) : 'No active BOM here'],
            ['Description', p.description, 'col-span-3'],
          ]} />
          <div>
            <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">BOM versions</div>
            <table className="w-full border-collapse border border-line">
              <thead><tr><th className="th">BOM</th><th className="th">Location / WH</th><th className="th text-right">Version</th><th className="th text-right">Batch</th><th className="th text-right">Output</th><th className="th">Status</th></tr></thead>
              <tbody>
                {p.boms.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>No BOM yet. Use Create BOM.</td></tr>}
                {p.boms.map((x) => (
                  <tr key={x.id} className="hover:bg-panel cursor-pointer" onClick={() => navigate(`/masters/boms/${x.id}`)}>
                    <td className="td text-accent">{x.bom_no}</td><td className="td">{x.location_code} / {x.warehouse_code}</td>
                    <td className="td num">{x.version}</td><td className="td num">{fmtQty(x.batch_size)} {x.batch_uom}</td>
                    <td className="td num">{fmtQty(x.expected_output_qty)} {x.output_uom}</td><td className="td"><Status value={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">Stock lots</div>
              <table className="w-full border-collapse border border-line">
                <thead><tr><th className="th">Lot</th><th className="th">Loc / WH</th><th className="th text-right">Qty</th><th className="th">Expiry</th></tr></thead>
                <tbody>
                  {p.stock.length === 0 && <tr><td className="td text-ink-muted" colSpan={4}>No stock</td></tr>}
                  {p.stock.map((s) => (
                    <tr key={`${s.lot_no}-${s.location_code}-${s.warehouse_code}`}><td className="td">{s.lot_no}</td><td className="td">{s.location_code} / {s.warehouse_code}</td>
                      <td className="td num">{fmtQty(s.quantity)} {s.uom}</td><td className="td">{fmtDate(s.expiry_date)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">Plans</div>
              <table className="w-full border-collapse border border-line">
                <thead><tr><th className="th">Plan</th><th className="th">Loc</th><th className="th text-right">Remaining</th><th className="th">Status</th></tr></thead>
                <tbody>
                  {p.plans.length === 0 && <tr><td className="td text-ink-muted" colSpan={4}>No plans</td></tr>}
                  {p.plans.map((pl) => (
                    <tr key={pl.id} className="hover:bg-panel cursor-pointer" onClick={() => navigate(`/planning/plans/${pl.id}`)}>
                      <td className="td text-accent">{pl.plan_no}</td><td className="td">{pl.location_code}</td>
                      <td className="td num">{fmtQty(pl.remaining_qty)}</td><td className="td"><Status value={pl.status} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function ProductsPage() {
  const { canWrite, notify, location } = useApp();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get(`/products${qs({ classification: type, status })}`), [type, status]);
  const close = () => setModal(null);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Product Name', className: 'whitespace-normal min-w-[200px]' },
    { key: 'classification', label: 'Type', value: (r) => TYPE[r.classification] },
    { key: 'category_name', label: 'Category' },
    { key: 'uom', label: 'UOM' },
    { key: 'active_boms', label: 'Active BOMs', value: (r) => r.active_boms.map((x) => `${x.location_code} v${x.version}`).join(', ') || '-' },
    { key: 'batch', label: `Batch → Output${location ? ` (${location.code})` : ''}`, value: (r) => (r.bom_in_scope
      ? `${fmtQty(r.bom_in_scope.batch_size)} ${r.bom_in_scope.batch_uom} → ${fmtQty(r.bom_in_scope.expected_output_qty)} ${r.bom_in_scope.output_uom}` : '-') },
    { key: 'cost_per_unit', label: 'Cost / Unit', align: 'right', render: (r) => (r.bom_in_scope ? money(r.cost_per_unit) : '-'), value: (r) => Number(r.cost_per_unit ?? 0) },
    { key: 'stock_qty', label: 'Stock', align: 'right', render: (r) => `${fmtQty(r.stock_qty)} ${r.uom}`, value: (r) => Number(r.stock_qty) },
    { key: 'open_plans', label: 'Open Plans', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
    actionsColumn({
      canWrite,
      onView: (r) => setModal({ type: 'view', id: r.id }),
      onEdit: (r) => setModal({ type: 'edit', material: r }),
      onDelete: (r) => setModal({ type: 'delete', row: r }),
    }),
  ];

  return (
    <div>
      <PageHeader title="Products" subtitle={`Finished and semi-finished goods with their BOM, cost, stock and plans${location ? ` · ${location.code}` : ' · all locations'}`}
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({ type: 'edit' })}><Plus size={14} /> New Product</button>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} exportName="products" newField="created_at"
          onRowClick={(r) => setModal({ type: 'view', id: r.id })}
          toolbar={<>
            <select className="input w-44" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Finished + Semi-Finished</option>
              <option value="FINISHED_GOOD">Finished Good</option><option value="SEMI_FINISHED">Semi-Finished</option>
            </select>
            <select className="input w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            </select>
          </>} />
      </div>
      {modal?.type === 'edit' && <MaterialForm material={modal.material} preset={{ classification: 'FINISHED_GOOD', uom: 'pcs' }} onClose={close}
        onDone={(m) => { setModal(null); notify(modal.material ? 'Product saved' : `Product ${m.code} created`); reload(); }} />}
      {modal?.type === 'view' && <ProductView id={modal.id} canWrite={canWrite} onClose={close} onEdit={(p) => setModal({ type: 'edit', material: p })} />}
      {modal?.type === 'delete' && <DeleteDialog label={`${modal.row.code} ${modal.row.name}`} path={`/materials/${modal.row.id}`} onClose={close}
        onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}
