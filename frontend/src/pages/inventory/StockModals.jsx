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

const INWARD_REASONS = ['Goods receipt', 'Opening stock', 'Return from production', 'Other'];
const OUTWARD_REASONS = ['Production issue', 'Sample / QC', 'Damaged', 'Expired disposal', 'Sale / dispatch', 'Other'];

/** Reason dropdown; "Other" asks for a short note. Value sent: "Reason" or "Other: note". */
function ReasonField({ options, value, onChange, required, className = '' }) {
  const [pick, setPick] = useState(options.includes(value) ? value : (value ? 'Other' : ''));
  const [note, setNote] = useState(options.includes(value) ? '' : value || '');
  const emit = (p, n) => onChange(p === 'Other' ? (n.trim() ? `Other: ${n.trim()}` : '') : p);
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <Field label="Reason" required={required}>
        <select className="input" value={pick} onChange={(e) => { setPick(e.target.value); emit(e.target.value, note); }}>
          <option value="">Select reason</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      {pick === 'Other' && (
        <Field label="Note" required><input className="input" value={note} placeholder="Short reason"
          onChange={(e) => { setNote(e.target.value); emit('Other', e.target.value); }} /></Field>
      )}
    </div>
  );
}

/**
 * Inward: pick the material; MPN, vendor, UOM, expiry, location / WH and lot no are suggested.
 * Location / WH: top selector, else where the material was last received, else the default WH.
 */
export function InwardModal({ onClose, onDone }) {
  const { settings, notify, locations, locationId: scopeLoc, warehouseId: scopeWh } = useApp();
  const mpns = useMpns();
  const materials = useMaterials({ status: 'ACTIVE' });
  const def = useDefaultScope();
  const [f, setF] = useState({ material_id: '', mpn_id: '', location_id: def.locationId, warehouse_id: def.warehouseId, lot_no: '', qty: '',
    mfg_date: today(), expiry_date: '', vendor_id: '', reason: 'Goods receipt', reference: '' });
  const [hint, setHint] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const material = materials.find((m) => m.id === f.material_id);
  const matMpns = mpns.filter((p) => p.material_id === f.material_id);
  const mpn = mpns.find((m) => m.id === f.mpn_id);
  const s = useSubmit((r) => { notify(`Stock added. New balance ${fmtQty(r.new_balance)}`); onDone(); });
  const life = (mat) => mat?.shelf_life_days || settings?.default_shelf_life_days || 365;
  const prefVendor = (p) => (p?.vendors?.find((x) => x.is_preferred) || p?.vendors?.[0])?.vendor_id || '';
  const stocked = materials.filter((m) => mpns.some((p) => p.material_id === m.id));

  const pickMaterial = async (id) => {
    const mat = materials.find((m) => m.id === id);
    const list = mpns.filter((p) => p.material_id === id)
      .sort((a, b) => Number(Boolean(b.vendors?.some((x) => x.is_preferred))) - Number(Boolean(a.vendors?.some((x) => x.is_preferred))));
    const p = list[0];
    const next = { ...f, material_id: id, mpn_id: p?.id || '', vendor_id: prefVendor(p),
      expiry_date: f.mfg_date ? addDays(f.mfg_date, life(mat)) : '' };
    setF(next);
    try {
      const d = await api.get(`/inventory/inward-defaults${qs({ material_id: id, location_id: scopeLoc || undefined })}`, { scoped: false });
      let loc = next.location_id; let wh = next.warehouse_id; let why = scopeLoc ? 'from the location selected at the top' : 'default warehouse';
      if (!scopeLoc && d.last_location_id) { loc = d.last_location_id; wh = d.last_warehouse_id; why = 'where this material was last received'; }
      else if (scopeLoc && !scopeWh && d.last_warehouse_id) { wh = d.last_warehouse_id; why = 'where this material was last received at this location'; }
      if (!loc && locations[0]) { loc = locations[0].id; wh = (locations[0].warehouses.find((w) => w.is_default) || locations[0].warehouses[0])?.id || ''; }
      setHint(why);
      setF((x) => ({ ...x, location_id: loc, warehouse_id: wh, lot_no: x.lot_no || d.suggested_lot_no }));
    } catch (e) { s.setError(e.message); }
  };

  return (
    <Modal title="Inward Stock" onClose={onClose} width="max-w-2xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={s.busy || !f.mpn_id}
          onClick={() => s.run(() => api.post('/inventory/inward', { ...f, qty: Number(f.qty) }))}>Save</button>
      </>}>
      <ErrorBox message={s.error} onClose={() => s.setError(null)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material" required hint={f.material_id && !matMpns.length ? 'This material has no MPN yet: add one in MPNs first' : 'Only materials with an MPN can be received'}>
          <Combobox value={f.material_id} onChange={pickMaterial} options={materialOptions(stocked)} placeholder="Select material" />
        </Field>
        <Field label="MPN" required hint={matMpns.length > 1 ? `${matMpns.length} MPNs for this material` : ''}>
          <select className="input" value={f.mpn_id} disabled={!matMpns.length}
            onChange={(e) => { const p = mpns.find((x) => x.id === e.target.value); setF({ ...f, mpn_id: e.target.value, vendor_id: prefVendor(p) }); }}>
            <option value="">-</option>
            {matMpns.map((p) => <option key={p.id} value={p.id}>{p.mpn_code}{p.vendors?.length ? ` · ${p.vendors.map((x) => x.vendor_name).join(', ')}` : ''}</option>)}
          </select>
        </Field>
      </div>
      {material && (
        <div className="text-xs text-ink-muted">{material.code} - {material.name} · {material.classification?.replace(/_/g, ' ')} · UOM {material.uom} · shelf life {life(material)} days</div>
      )}
      <LocationWarehouse locationId={f.location_id} warehouseId={f.warehouse_id} required
        onChange={(l, w) => { setHint(''); setF({ ...f, location_id: l, warehouse_id: w }); }} />
      {hint && <div className="text-xs2 text-ink-faint -mt-2">Location / WH suggested: {hint}. You can change it.</div>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Lot No" required hint="Suggested; type the vendor's lot if it has one"><input className="input" value={f.lot_no} onChange={set('lot_no')} /></Field>
        <Field label={`Quantity${material ? ` (${material.uom})` : ''}`} required><input className="input num" type="number" min="0" step="any" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Vendor">
          <select className="input" value={f.vendor_id} onChange={set('vendor_id')}>
            <option value="">-</option>
            {(mpn?.vendors || []).map((x) => <option key={x.vendor_id} value={x.vendor_id}>{x.vendor_name}{x.is_preferred ? ' (preferred)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Mfg Date"><input className="input" type="date" value={f.mfg_date}
          onChange={(e) => setF({ ...f, mfg_date: e.target.value, expiry_date: e.target.value && material ? addDays(e.target.value, life(material)) : f.expiry_date })} /></Field>
        <Field label="Expiry Date" hint="Mfg date + shelf life"><input className="input" type="date" value={f.expiry_date} onChange={set('expiry_date')} /></Field>
        <Field label="Reference" required={/^goods receipt/i.test(f.reason)}><input className="input" placeholder="GRN / invoice no" value={f.reference} onChange={set('reference')} /></Field>
      </div>
      <ReasonField options={INWARD_REASONS} value={f.reason} onChange={(r) => setF((x) => ({ ...x, reason: r }))} />
    </Modal>
  );
}

/**
 * Outward: pick the material -> lots from every location / WH you can see (earliest expiry first).
 * Picking a lot sets its location / WH. The top selector narrows the list; "All locations" shows all.
 */
export function OutwardModal({ lot: presetLot, onClose, onDone }) {
  const { notify, locations, locationId: scopeLoc } = useApp();
  const materials = useMaterials();
  const [materialId, setMaterialId] = useState(presetLot?.material_id || '');
  const [locFilter, setLocFilter] = useState(presetLot?.location_id || scopeLoc || '');
  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState(presetLot?.id || '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const needsRef = /^sale/i.test(reason);
  const s = useSubmit((r) => { notify(`Stock issued. Lot balance ${fmtQty(r.new_balance)}`); onDone(); });

  useEffect(() => {
    if (!materialId) { setLots([]); return; }
    api.get(`/inventory/lots${qs({ material_id: materialId, location_id: locFilter || undefined, include_expired: 'true' })}`, { scoped: false })
      .then((rows) => {
        setLots(rows);
        if (!presetLot) setLotId(rows.find((r) => !r.is_expired)?.id || '');
      })
      .catch((e) => s.setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId, locFilter]);

  const lot = lots.find((x) => x.id === lotId) || presetLot;
  const withStock = materials.filter((m) => m.id === materialId || m.status === 'ACTIVE');
  return (
    <Modal title="Outward Stock" onClose={onClose} width="max-w-3xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={s.busy || !lotId || !reason || (needsRef && !reference.trim())}
          onClick={() => s.run(() => api.post('/inventory/outward', { inventory_id: lotId, qty: Number(qty), reason, reference }))}>Remove Stock</button>
      </>}>
      <ErrorBox message={s.error} onClose={() => s.setError(null)} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Material" required className="col-span-2">
          <Combobox value={materialId} onChange={(v) => { setMaterialId(v); setLotId(''); }} options={materialOptions(withStock)} disabled={!!presetLot} placeholder="Select material" />
        </Field>
        <Field label="Show lots in">
          <select className="input" value={locFilter} disabled={!!presetLot} onChange={(e) => setLocFilter(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="text-xs text-ink-muted">Lots, earliest expiry first (FEFO). The first usable lot is selected; its location and warehouse are used. Expired lots cannot be issued.</div>
      <div className="card max-h-56 overflow-y-auto">
        <table className="w-full">
          <thead><tr><th className="th w-8" /><th className="th">Lot No</th><th className="th">MPN</th><th className="th">Location / WH</th><th className="th">Expiry</th><th className="th text-right">Qty</th></tr></thead>
          <tbody>
            {lots.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>{materialId ? 'No stock for this material' : 'Select a material'}</td></tr>}
            {lots.map((x) => (
              <tr key={x.id} className={x.is_expired ? 'text-ink-faint' : 'hover:bg-panel cursor-pointer'} onClick={() => !x.is_expired && setLotId(x.id)}>
                <td className="td"><input type="radio" disabled={x.is_expired} checked={lotId === x.id} onChange={() => setLotId(x.id)} /></td>
                <td className="td">{x.lot_no}</td>
                <td className="td">{x.mpn_code}</td>
                <td className="td">{x.location_code} / {x.warehouse_code}</td>
                <td className={`td ${x.is_expired ? 'text-danger' : ''}`}>{fmtDate(x.expiry_date)}{x.is_expired ? ' (expired)' : ''}</td>
                <td className="td num">{fmtQty(x.quantity)} {x.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lot && <div className="text-xs text-ink-muted">From <b>{lot.location_code} / {lot.warehouse_code}</b> · lot <b>{lot.lot_no}</b> · available {fmtQty(lot.quantity)} {lot.uom}</div>}
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Qty to remove${lot ? ` (max ${fmtQty(lot.quantity)} ${lot.uom})` : ''}`} required>
          <input className="input num" type="number" min="0" step="any" max={lot?.quantity} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <ReasonField options={OUTWARD_REASONS} value={reason} onChange={setReason} required className="col-span-2" />
        <Field label="Reference" required={needsRef}><input className="input" placeholder="Invoice / DC no" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
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
      <div className="text-xs text-ink-muted">Draft → In-Transit → Completed. Dispatch takes the stock out of this warehouse; Completed adds it at the destination; cancelling an In-Transit transfer puts it back.</div>
      <LocationWarehouse locationId={to.l} warehouseId={to.w} required onChange={(l, w) => setTo({ l, w })} />
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Qty (${lot.uom})`} required><input className="input num" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Reason" className="col-span-2"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
