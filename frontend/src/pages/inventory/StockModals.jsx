import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { fmtDate, fmtQty, today } from '../../lib/format';
import { ErrorBox, Field, Modal } from '../../components/ui';
import { Combobox, LocationWarehouse, materialOptions, mpnOptions, useDefaultScope, useMaterials, useMpns } from '../../components/pickers';

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function useSubmit(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      onDone(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** Inward: MPN + Location + WH + Lot + Qty + dates */
export function InwardModal({ onClose, onDone }) {
  const { settings, notify } = useApp();
  const mpns = useMpns();
  const materials = useMaterials();
  const def = useDefaultScope();
  const [f, setF] = useState({ mpn_id: '', location_id: def.locationId, warehouse_id: def.warehouseId, lot_no: '', qty: '',
    mfg_date: today(), expiry_date: '', vendor_id: '', reason: 'Goods receipt', reference: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const mpn = mpns.find((m) => m.id === f.mpn_id);
  const material = materials.find((m) => m.id === mpn?.material_id);
  const s = useSubmit((r) => { notify(`Stock added. New balance ${fmtQty(r.new_balance)}`); onDone(); });

  const pickMpn = (id) => {
    const p = mpns.find((m) => m.id === id);
    const mat = materials.find((m) => m.id === p?.material_id);
    const life = mat?.shelf_life_days || settings?.default_shelf_life_days || 365;
    const pref = p?.vendors?.find((x) => x.is_preferred) || p?.vendors?.[0];
    setF({ ...f, mpn_id: id, vendor_id: pref?.vendor_id || '', expiry_date: f.mfg_date ? addDays(f.mfg_date, life) : '' });
  };

  return (
    <Modal title="Inward Stock" onClose={onClose} width="max-w-2xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={s.busy}
          onClick={() => s.run(() => api.post('/inventory/inward', { ...f, qty: Number(f.qty) }))}>Save</button>
      </>}>
      <ErrorBox message={s.error} onClose={() => s.setError(null)} />
      <Field label="MPN" required>
        <Combobox value={f.mpn_id} onChange={pickMpn} options={mpnOptions(mpns)} placeholder="Select MPN" />
      </Field>
      {mpn && (
        <div className="text-xs text-ink-muted">Material: {mpn.material_code} - {mpn.material_name} · Classification: {mpn.classification?.replace(/_/g, ' ')} · UOM: {mpn.uom}</div>
      )}
      <LocationWarehouse locationId={f.location_id} warehouseId={f.warehouse_id} required
        onChange={(l, w) => setF({ ...f, location_id: l, warehouse_id: w })} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Lot No" required><input className="input" value={f.lot_no} onChange={set('lot_no')} /></Field>
        <Field label={`Quantity${mpn ? ` (${mpn.uom})` : ''}`} required><input className="input num" type="number" min="0" step="any" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Vendor">
          <select className="input" value={f.vendor_id} onChange={set('vendor_id')}>
            <option value="">-</option>
            {(mpn?.vendors || []).map((x) => <option key={x.vendor_id} value={x.vendor_id}>{x.vendor_name}</option>)}
          </select>
        </Field>
        <Field label="Mfg Date"><input className="input" type="date" value={f.mfg_date}
          onChange={(e) => setF({ ...f, mfg_date: e.target.value, expiry_date: e.target.value && material ? addDays(e.target.value, material.shelf_life_days || settings?.default_shelf_life_days || 365) : f.expiry_date })} /></Field>
        <Field label="Expiry Date"><input className="input" type="date" value={f.expiry_date} onChange={set('expiry_date')} /></Field>
        <Field label="Reference"><input className="input" placeholder="GRN / invoice no" value={f.reference} onChange={set('reference')} /></Field>
      </div>
      <Field label="Reason"><input className="input" value={f.reason} onChange={set('reason')} /></Field>
    </Modal>
  );
}

/** Outward: choose material -> FEFO lots -> select lot + qty */
export function OutwardModal({ lot: presetLot, onClose, onDone }) {
  const { notify } = useApp();
  const materials = useMaterials();
  const def = useDefaultScope();
  const [materialId, setMaterialId] = useState(presetLot?.material_id || '');
  const [loc, setLoc] = useState({ l: presetLot?.location_id || def.locationId, w: presetLot?.warehouse_id || def.warehouseId });
  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState(presetLot?.id || '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const s = useSubmit((r) => { notify(`Stock issued. Lot balance ${fmtQty(r.new_balance)}`); onDone(); });

  useEffect(() => {
    if (!materialId || !loc.l) { setLots([]); return; }
    api.get(`/inventory/lots${qs({ material_id: materialId, location_id: loc.l, warehouse_id: loc.w, include_expired: 'true' })}`, { scoped: false })
      .then((rows) => {
        setLots(rows);
        if (!presetLot) setLotId(rows.find((r) => !r.is_expired)?.id || '');
      })
      .catch((e) => s.setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId, loc.l, loc.w]);

  const lot = lots.find((x) => x.id === lotId) || presetLot;
  return (
    <Modal title="Outward Stock" onClose={onClose} width="max-w-3xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={s.busy || !lotId}
          onClick={() => s.run(() => api.post('/inventory/outward', { inventory_id: lotId, qty: Number(qty), reason }))}>Remove Stock</button>
      </>}>
      <ErrorBox message={s.error} onClose={() => s.setError(null)} />
      <Field label="Material" required>
        <Combobox value={materialId} onChange={(v) => { setMaterialId(v); setLotId(''); }} options={materialOptions(materials)} disabled={!!presetLot} />
      </Field>
      <LocationWarehouse locationId={loc.l} warehouseId={loc.w} disabledLocation={!!presetLot}
        onChange={(l, w) => setLoc({ l, w })} />
      <div className="text-xs text-ink-muted">Available lots (FEFO - earliest expiry first). Expired lots cannot be issued.</div>
      <div className="card max-h-56 overflow-y-auto">
        <table className="w-full">
          <thead><tr><th className="th w-8" /><th className="th">Lot No</th><th className="th">MPN</th><th className="th">WH</th><th className="th">Expiry</th><th className="th text-right">Qty</th></tr></thead>
          <tbody>
            {lots.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>No stock for this selection</td></tr>}
            {lots.map((x) => (
              <tr key={x.id} className={x.is_expired ? 'text-ink-faint' : 'hover:bg-panel cursor-pointer'} onClick={() => !x.is_expired && setLotId(x.id)}>
                <td className="td"><input type="radio" disabled={x.is_expired} checked={lotId === x.id} onChange={() => setLotId(x.id)} /></td>
                <td className="td">{x.lot_no}</td>
                <td className="td">{x.mpn_code}</td>
                <td className="td">{x.warehouse_code}</td>
                <td className={`td ${x.is_expired ? 'text-danger' : ''}`}>{fmtDate(x.expiry_date)}{x.is_expired ? ' (expired)' : ''}</td>
                <td className="td num">{fmtQty(x.quantity)} {x.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Qty to remove${lot ? ` (max ${fmtQty(lot.quantity)} ${lot.uom})` : ''}`} required>
          <input className="input num" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Reason" required className="col-span-2">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sample, disposal, dispatch" />
        </Field>
      </div>
    </Modal>
  );
}

/** Adjustment (Admin): Adjustment Qty = New Physical Qty - System Qty */
export function AdjustModal({ lot, onClose, onDone }) {
  const { notify } = useApp();
  const [physical, setPhysical] = useState(String(lot.quantity));
  const [reason, setReason] = useState('');
  const diff = useMemo(() => (physical === '' ? 0 : Math.round((Number(physical) - Number(lot.quantity)) * 10000) / 10000), [physical, lot]);
  const s = useSubmit((r) => { notify(`Adjusted by ${fmtQty(r.adjustment_qty)} ${lot.uom}`); onDone(); });
  return (
    <Modal title="Stock Adjustment" onClose={onClose}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={s.busy || diff === 0}
          onClick={() => s.run(() => api.post('/inventory/adjustments', { inventory_id: lot.id, new_physical_qty: Number(physical), reason }))}>Post Adjustment</button>
      </>}>
      <ErrorBox message={s.error} onClose={() => s.setError(null)} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
        <span className="text-ink-muted">MPN</span><span>{lot.mpn_code}</span>
        <span className="text-ink-muted">Material</span><span>{lot.material_name}</span>
        <span className="text-ink-muted">Location / WH</span><span>{lot.location_code} / {lot.warehouse_code}</span>
        <span className="text-ink-muted">Lot No</span><span>{lot.lot_no}</span>
        <span className="text-ink-muted">System Qty</span><span className="tabular-nums">{fmtQty(lot.quantity)} {lot.uom}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="New Physical Qty" required><input className="input num" type="number" min="0" step="any" value={physical} onChange={(e) => setPhysical(e.target.value)} /></Field>
        <Field label="Adjustment Qty"><input className="input num" readOnly value={`${diff > 0 ? '+' : ''}${fmtQty(diff)}`} /></Field>
      </div>
      <Field label="Reason" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Physical count, damage" /></Field>
    </Modal>
  );
}

/** Create a transfer (DRAFT) from a lot */
export function TransferModal({ lot, onClose, onDone }) {
  const { notify } = useApp();
  const [to, setTo] = useState({ l: lot.location_id, w: '' });
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const s = useSubmit((r) => { notify(`Transfer ${r.transfer_no} created (Draft)`); onDone(r); });
  return (
    <Modal title="New Stock Transfer" onClose={onClose} width="max-w-2xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={s.busy}
          onClick={() => s.run(() => api.post('/transfers', {
            mpn_id: lot.mpn_id, lot_no: lot.lot_no, qty: Number(qty), reason,
            from_location_id: lot.location_id, from_warehouse_id: lot.warehouse_id, to_location_id: to.l, to_warehouse_id: to.w,
          }))}>Create Draft</button>
      </>}>
      <ErrorBox message={s.error} onClose={() => s.setError(null)} />
      <div className="text-[13px]">
        From <b>{lot.location_code} / {lot.warehouse_code}</b> · {lot.mpn_code} · Lot <b>{lot.lot_no}</b> · Available {fmtQty(lot.quantity)} {lot.uom}
      </div>
      <div className="text-xs text-ink-muted">Stock moves only when the transfer is marked Completed (Draft → In-Transit → Completed).</div>
      <LocationWarehouse locationId={to.l} warehouseId={to.w} required onChange={(l, w) => setTo({ l, w })} />
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Qty (${lot.uom})`} required><input className="input num" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Reason" className="col-span-2"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
