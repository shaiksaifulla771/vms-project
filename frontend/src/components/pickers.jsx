import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApp } from '../lib/app-context';
import { Link } from 'react-router-dom';
import { Field } from './ui';

/** Searchable single select for long lists. options: [{value, label, sub}] */
export function Combobox({ value, onChange, options, placeholder = 'Select...', disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = n ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(n)) : options;
    return l.slice(0, 200);
  }, [q, options]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} onClick={() => { setOpen((x) => !x); setQ(''); }}
        className="input flex items-center justify-between text-left">
        <span className={`truncate ${selected ? '' : 'text-ink-faint'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className="text-ink-faint shrink-0" />
      </button>
      {open && (
        // preventDefault: stop an enclosing <label> from re-clicking the toggle button
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-line-strong rounded shadow"
          onClick={(e) => e.preventDefault()}>
          <input autoFocus className="input border-0 border-b rounded-none" placeholder="Type to search"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-64 overflow-y-auto">
            {list.length === 0 && <div className="px-3 py-2 text-ink-muted">No matches</div>}
            {list.map((o) => (
              <button type="button" key={o.value} onClick={() => { onChange(o.value, o); setOpen(false); }}
                className={`block w-full text-left px-3 py-1.5 hover:bg-accent-soft ${o.value === value ? 'bg-accent-soft' : ''}`}>
                <div className="truncate">{o.label}</div>
                {o.sub && <div className="text-xs2 text-ink-muted truncate">{o.sub}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function useMaterials(params = {}) {
  const [rows, setRows] = useState([]);
  const key = JSON.stringify(params);
  useEffect(() => {
    api.get(`/materials${qs(params)}`, { scoped: false }).then(setRows).catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}

export function useMpns() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/mpns?status=ACTIVE', { scoped: false }).then(setRows).catch(() => setRows([])); }, []);
  return rows;
}

export function useVendors() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/vendors', { scoped: false }).then(setRows).catch(() => setRows([])); }, []);
  return rows;
}

export const materialOptions = (rows) => rows.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}`, sub: `${m.classification.replace(/_/g, ' ')} · ${m.uom}` }));
export const mpnOptions = (rows) => rows.map((p) => ({ value: p.id, label: `${p.mpn_code} - ${p.material_name}`, sub: `${p.material_code} · ${p.uom}${p.vendors?.[0] ? ` · ${p.vendors[0].vendor_name}` : ''}` }));

/** Location + Warehouse pair of selects */
export function LocationWarehouse({ locationId, warehouseId, onChange, required, disabledLocation, allowAllWarehouses }) {
  const { locations } = useApp();
  const loc = locations.find((l) => l.id === locationId);
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="label">Location{required && <span className="text-danger"> *</span>}</span>
        <select className="input" value={locationId || ''} disabled={disabledLocation}
          onChange={(e) => {
            const l = locations.find((x) => x.id === e.target.value);
            const def = l?.warehouses.find((w) => w.is_default) || l?.warehouses[0];
            onChange(e.target.value, allowAllWarehouses ? '' : (def?.id || ''));
          }}>
          <option value="">Select location</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Warehouse{required && <span className="text-danger"> *</span>}</span>
        <select className="input" value={warehouseId || ''} disabled={!loc} onChange={(e) => onChange(locationId, e.target.value)}>
          <option value="">{allowAllWarehouses ? 'All warehouses' : 'Select warehouse'}</option>
          {(loc?.warehouses || []).filter((w) => w.is_active !== false).map((w) => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Default location / WH for new documents: the global selector, else the first location's default WH. */
export function useDefaultScope() {
  const { locations, locationId, warehouseId } = useApp();
  const loc = locations.find((l) => l.id === locationId) || null;
  const wh = warehouseId || loc?.warehouses.find((w) => w.is_default)?.id || '';
  return { locationId: loc?.id || '', warehouseId: loc ? wh : '' };
}

/** Material categories as a tree [{id, name, status, children: [...] }] */
export function useCategories(reloadKey = 0) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/categories', { scoped: false }).then(setRows).catch(() => setRows([])); }, [reloadKey]);
  return rows;
}

export const vendorOptions = (rows) => rows.filter((v) => v.status === 'ACTIVE')
  .map((v) => ({ value: v.id, label: `${v.code} - ${v.name}`, sub: [v.default_address, v.phone].filter(Boolean).join(' · ') }));

/** Top-level categories a classification may use: its own plus unassigned ones. */
export const categoriesFor = (cats, cls, keepId) => cats.filter((c) => c.id === keepId
  || (c.status === 'ACTIVE' && (!cls || !c.classification || c.classification === cls)));

/** Fixed UOM list (kg, g, ltr, pcs, packet, box, ...) shown as a dropdown */
export function useUoms(reloadKey = 0) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/uoms', { scoped: false }).then(setRows).catch(() => setRows([])); }, [reloadKey]);
  return rows;
}

export const UOM_TYPE_LABEL = { WEIGHT: 'Weight', VOLUME: 'Volume', COUNT: 'Count', LENGTH: 'Length', OTHER: 'Other' };

/**
 * UOM dropdown grouped by type. Only active UOMs are offered; the current value is always kept
 * (so an old record with an inactive or legacy UOM still shows it).
 */
export function UomSelect({ value, onChange, uoms, placeholder, className = 'input', disabled, title }) {
  const lower = (x) => String(x || '').toLowerCase();
  const inList = uoms.some((u) => lower(u.code) === lower(value));
  const groups = Object.keys(UOM_TYPE_LABEL).map((t) => [t, uoms.filter((u) => u.uom_type === t
    && (u.status === 'ACTIVE' || lower(u.code) === lower(value)))]).filter(([, l]) => l.length);
  const match = uoms.find((u) => lower(u.code) === lower(value));
  return (
    <select className={className} value={match ? match.code : (value || '')} disabled={disabled} title={title}
      onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? '-'}</option>
      {value && !inList && uoms.length > 0 && <option value={value}>{value}</option>}
      {groups.map(([t, list]) => (
        <optgroup key={t} label={UOM_TYPE_LABEL[t]}>
          {list.map((u) => <option key={u.code} value={u.code}>{u.code} - {u.name}{u.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Location first: the active BOMs at one location, the products they make, and each product's BOMs
 * (Default first). Used by New Plan and Batch Entry (Ad Hoc).
 */
export function useLocationBoms(locationId) {
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!locationId) { setBoms([]); return undefined; }
    let live = true;
    setLoading(true);
    api.get(`/boms${qs({ status: 'ACTIVE', location_id: locationId })}`, { scoped: false })
      .then((r) => { if (live) setBoms(r); })
      .catch(() => { if (live) setBoms([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [locationId]);
  const products = [];
  const seen = new Set();
  for (const b of boms) {
    if (!seen.has(b.product_id)) {
      seen.add(b.product_id);
      products.push({ value: b.product_id, label: `${b.product_code} - ${b.product_name}`,
        sub: b.product_classification === 'SEMI_FINISHED' ? 'Semi-finished' : 'Finished good' });
    }
  }
  const bomsFor = (productId) => boms.filter((b) => b.product_id === productId)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || b.version - a.version);
  return { boms, products, bomsFor, loading };
}

/** Default BOM of a product at the location (or its only / newest active one). */
export const defaultBomId = (list) => (list.find((b) => b.is_default) || list[0])?.id || '';

/** Location -> Product (only those with a BOM there) -> BOM. Calls onChange({ location_id, product_id, bom_id }). */
export function LocationProductBom({ value, onChange, disabled, productPlaceholder = 'Select product', extraProducts = [],
  classes = { location: '', product: 'col-span-2', bom: '' } }) {
  const { locations } = useApp();
  const { products, bomsFor, loading } = useLocationBoms(value.location_id);
  const list = value.product_id ? bomsFor(value.product_id) : [];
  // Batch Entry (Ad Hoc) may also make a product that has no BOM here; its inputs are entered by hand.
  const withBom = new Set(products.map((p) => p.value));
  const options = [...products, ...extraProducts.filter((m) => !withBom.has(m.id))
    .map((m) => ({ value: m.id, label: `${m.code} - ${m.name}`, sub: 'No BOM here - enter inputs by hand' }))];
  const setLoc = (loc) => onChange({ location_id: loc, product_id: '', bom_id: '' });
  const setProduct = (pid) => onChange({ ...value, product_id: pid, bom_id: defaultBomId(bomsFor(pid)) });
  return (
    <>
      <Field label="Manufacturing Location" required className={classes.location}>
        <select className="input" value={value.location_id} disabled={disabled} onChange={(e) => setLoc(e.target.value)}>
          <option value="">Select</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
        </select>
      </Field>
      <Field label="Product" required className={classes.product}
        hint={value.location_id && !loading && !products.length
          ? <span className="text-danger">No active BOMs at this location yet. <Link className="text-accent" to="/masters/boms/new">Create BOM</Link></span>
          : (value.location_id ? `${products.length} product${products.length === 1 ? '' : 's'} with a BOM here` : 'Choose the location first')}>
        <Combobox value={value.product_id} options={options} onChange={setProduct} disabled={disabled || !value.location_id}
          placeholder={value.location_id ? productPlaceholder : 'Choose the location first'} />
      </Field>
      <Field label="BOM" required className={classes.bom} hint={list.length > 1 ? `${list.length} active BOMs; Default pre-selected` : ''}>
        <select className="input" value={value.bom_id} disabled={disabled || !value.product_id} onChange={(e) => onChange({ ...value, bom_id: e.target.value })}>
          {!list.length && <option value="">-</option>}
          {list.map((b) => <option key={b.id} value={b.id}>{b.bom_no} v{b.version}{b.name ? ` · ${b.name}` : ''}{b.is_default ? ' (Default)' : ''}</option>)}
        </select>
      </Field>
    </>
  );
}
