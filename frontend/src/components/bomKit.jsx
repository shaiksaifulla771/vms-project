import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApp, useData } from '../lib/app-context';
import { fmtQty } from '../lib/format';
import { ActionMenu, Modal, Status } from './ui';
import { CopyDialog } from '../pages/masters/BomDetailPage';

export const money = (v) => (v === null || v === undefined ? '' : `₹ ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`);

/** Link to New BOM with the product (and location) filled in. */
export const newBomUrl = (productId, locationId) => `/masters/boms/new${qs({ product_id: productId, location_id: locationId })}`;

/**
 * The actions a BOM row offers in a ⋯ menu, plus the dialogs they open.
 * items(bom) -> menu items; dialogs -> render once in the page. onChanged() reloads the list.
 */
export function useBomActions(onChanged) {
  const navigate = useNavigate();
  const { canWrite, notify } = useApp();
  const [dialog, setDialog] = useState(null);           // { type: 'copy' | 'obsolete', bom }
  const run = async (bom, action, msg) => {
    try { await api.post(`/boms/${bom.id}/${action}`); notify(msg); if (onChanged) onChanged(); } catch (e) { notify(e.message, 'error'); }
  };
  const items = (b) => [
    { label: 'Open', onClick: () => navigate(`/masters/boms/${b.id}`) },
    { label: 'Edit', onClick: () => navigate(`/masters/boms/${b.id}/edit`), hidden: !canWrite || b.status !== 'DRAFT' },
    { label: 'Activate', onClick: () => run(b, 'activate', `${b.bom_no} activated`), hidden: !canWrite || b.status !== 'DRAFT' },
    { label: 'Set as Default', onClick: () => run(b, 'set-default', `${b.bom_no} is now the Default at ${b.location_code}`),
      hidden: !canWrite || b.status !== 'ACTIVE' || b.is_default },
    { label: 'Copy as new BOM', onClick: () => setDialog({ type: 'copy', bom: b }), hidden: !canWrite },
    { label: 'Mark obsolete', onClick: () => setDialog({ type: 'obsolete', bom: b }), danger: true, hidden: !canWrite || b.status !== 'ACTIVE' },
  ];
  const close = () => setDialog(null);
  const dialogs = (
    <>
      {dialog?.type === 'copy' && (
        <CopyDialog bom={dialog.bom} onClose={close}
          onDone={(nb) => { close(); notify(`Copied to ${nb.bom_no} (draft)`); navigate(`/masters/boms/${nb.id}/edit`); }} />
      )}
      {dialog?.type === 'obsolete' && (
        <Modal title={`Mark ${dialog.bom.bom_no} obsolete?`} onClose={close}
          footer={<><button type="button" className="btn-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn-danger" onClick={() => { const b = dialog.bom; close(); run(b, 'obsolete', `${b.bom_no} marked obsolete`); }}>Mark obsolete</button></>}>
          <p className="text-[13px]">
            {dialog.bom.bom_no} v{dialog.bom.version}{dialog.bom.name ? ` (${dialog.bom.name})` : ''} can no longer be used for new plans or batches.
            {dialog.bom.is_default ? ' It is the Default, so another active BOM at this location becomes the Default.' : ''} This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
  return { items, dialogs };
}

/**
 * Every current BOM of one product (all locations, active and draft), shown under the product row.
 */
export function ProductBoms({ product }) {
  const { canWrite, locationId } = useApp();
  const { data, loading, error, reload } = useData(
    () => api.get(`/boms${qs({ product_id: product.id })}`, { scoped: false }), [product.id]);
  const actions = useBomActions(reload);
  const list = (data || []).filter((b) => b.status !== 'OBSOLETE');
  return (
    <div className="rounded border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <span className="font-semibold text-ink">BOMs of {product.code}</span>
        <span className="text-xs text-ink-muted">{list.length ? `${list.length} current` : 'none yet'}</span>
        {canWrite && (
          <Link className="btn-link ml-auto" to={newBomUrl(product.id, locationId)}><Plus size={13} /> Add BOM</Link>
        )}
      </div>
      {loading && <div className="px-3 py-2 text-ink-muted text-[13px]">Loading...</div>}
      {error && <div className="px-3 py-2 text-danger text-[13px]">{error}</div>}
      {!loading && !error && list.length === 0 && (
        <div className="px-3 py-3 text-[13px] text-ink-muted">This product has no BOM yet. Add one to plan and produce it.</div>
      )}
      {list.length > 0 && (
        <table className="w-full border-collapse">
          <thead><tr>
            <th className="th">BOM</th><th className="th">Name</th><th className="th">Location</th><th className="th text-right">Version</th>
            <th className="th text-right">Batch</th><th className="th text-right">Output</th><th className="th text-right">Cost / Unit</th>
            <th className="th">Status</th><th className="th w-10" />
          </tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="hover:bg-panel">
                <td className="td"><Link className="text-accent font-medium" to={`/masters/boms/${b.id}`}>{b.bom_no}</Link></td>
                <td className="td">{b.name || <span className="text-ink-faint">-</span>}
                  {b.is_default && <span className="ml-2 text-xs2 px-1.5 py-0.5 rounded bg-accent-soft text-accent">Default</span>}</td>
                <td className="td">{b.location_code} / {b.warehouse_code}</td>
                <td className="td num">{b.version}</td>
                <td className="td num">{fmtQty(b.batch_size)} {b.batch_uom}</td>
                <td className="td num">{fmtQty(b.expected_output_qty)} {b.output_uom}</td>
                <td className="td num">{b.cost_per_unit == null ? '-' : `${money(b.cost_per_unit)}${b.unpriced_lines ? ' *' : ''}`}</td>
                <td className="td"><Status value={b.status} /></td>
                <td className="td py-0 text-right"><ActionMenu label={`Actions for ${b.bom_no}`} items={actions.items(b)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {actions.dialogs}
    </div>
  );
}

/**
 * New / edit BOM: the BOMs that already exist for this product at this location, and the version the new one gets.
 */
export function ExistingBoms({ productId, locationId, currentId }) {
  const { locations } = useApp();
  const { data } = useData(() => (productId && locationId
    ? api.get(`/boms${qs({ product_id: productId, location_id: locationId, cost: '0' })}`, { scoped: false })
    : Promise.resolve([])), [productId, locationId]);
  if (!productId || !locationId || !data) return null;
  const loc = locations.find((l) => l.id === locationId)?.code || '';
  const others = data.filter((b) => b.id !== currentId);
  const current = others.filter((b) => b.status !== 'OBSOLETE');
  const nextVersion = data.reduce((m, b) => Math.max(m, Number(b.version)), 0) + 1;
  return (
    <div className="card px-3 py-2.5 text-[13px]" role="note" aria-label="Existing BOMs">
      {current.length === 0 ? (
        <span className="text-ink-soft">No BOM for this product at {loc} yet. This one will be the Default when activated.</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ink-soft">Already at {loc}:</span>
          {current.map((b) => (
            <Link key={b.id} to={`/masters/boms/${b.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
              {b.bom_no} v{b.version}{b.name ? ` ${b.name}` : ''}
              {b.is_default && <span className="text-xs2 px-1 rounded bg-accent-soft">Default</span>}
              {b.status === 'DRAFT' && <span className="text-xs2 text-ink-muted">(draft)</span>}
            </Link>
          ))}
          {!currentId && <span className="ml-auto text-ink-muted">This will be version {nextVersion}.</span>}
        </div>
      )}
    </div>
  );
}
