import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "../api/client";
import type {
  AvailabilityResponse,
  InventoryLot,
  InventoryTransaction,
  Location,
  Material,
  Product,
  Warehouse,
} from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_INWARD_FORM = {
  material_id: "",
  lot_number: "",
  location_id: "",
  warehouse_id: "",
  quantity: 0,
  uom: "kg",
  mfg_date: TODAY,
  expiry_date: "",
  transaction_type: "INWARD_PURCHASE" as const,
  reference_id: "",
};

const EMPTY_OUTWARD_FORM = {
  lot_id: "",
  quantity: 0,
  transaction_type: "OUTWARD_DISPOSAL" as const,
  reason_notes: "",
};

export function Inventory() {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInward, setShowInward] = useState(false);
  const [showOutward, setShowOutward] = useState(false);
  const [inwardForm, setInwardForm] = useState(EMPTY_INWARD_FORM);
  const [outwardForm, setOutwardForm] = useState(EMPTY_OUTWARD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [availabilityMaterialId, setAvailabilityMaterialId] = useState("");
  const [availabilityLocationId, setAvailabilityLocationId] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lotList, txnList, mats, prods, locs, whs] = await Promise.all([
        api.get<InventoryLot[]>("/api/v1/inventory/lots"),
        api.get<InventoryTransaction[]>("/api/v1/inventory/transactions"),
        api.get<Material[]>("/api/v1/materials"),
        api.get<Product[]>("/api/v1/products"),
        api.get<Location[]>("/api/v1/locations"),
        api.get<Warehouse[]>("/api/v1/warehouses"),
      ]);
      setLots(lotList);
      setTransactions(txnList);
      setMaterials(mats);
      setProducts(prods);
      setLocations(locs);
      setWarehouses(whs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const materialName = (id: string | null) => (id ? materials.find((m) => m.id === id)?.name ?? id.slice(0, 8) : "—");
  const productName = (id: string | null) => (id ? products.find((p) => p.id === id)?.name ?? id.slice(0, 8) : "—");
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8);

  const handleInward = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/inventory/entries/inward", {
        ...inwardForm,
        product_id: null,
        reference_id: inwardForm.reference_id || null,
      });
      setInwardForm(EMPTY_INWARD_FORM);
      setShowInward(false);
      setNotice("Stock added.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add stock");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutward = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/inventory/entries/outward", outwardForm);
      setOutwardForm(EMPTY_OUTWARD_FORM);
      setShowOutward(false);
      setNotice("Stock removed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove stock");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAvailability = async () => {
    if (!availabilityMaterialId || !availabilityLocationId) return;
    setError(null);
    try {
      setAvailability(
        await api.get<AvailabilityResponse>(
          `/api/v1/inventory/availability?material_id=${availabilityMaterialId}&location_id=${availabilityLocationId}`,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to check availability");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Inventory</h1>
        <div className="page-header-actions">
          <RoleGate minimum="editor">
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowInward((v) => !v);
                setShowOutward(false);
              }}
            >
              {showInward ? "Cancel" : "Add Stock (Inward)"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowOutward((v) => !v);
                setShowInward(false);
              }}
            >
              {showOutward ? "Cancel" : "Remove Stock (Outward)"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />
      {notice && <div className="notice-banner">{notice}</div>}

      {showInward && (
        <form className="stacked-form" onSubmit={handleInward}>
          <div className="line-row">
            <label className="field">
              Material
              <select
                required
                value={inwardForm.material_id}
                onChange={(e) => setInwardForm({ ...inwardForm, material_id: e.target.value })}
              >
                <option value="">Select…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Lot number
              <input
                required
                value={inwardForm.lot_number}
                onChange={(e) => setInwardForm({ ...inwardForm, lot_number: e.target.value })}
              />
            </label>
            <label className="field">
              Quantity
              <input
                type="number"
                min={0.0001}
                step="any"
                required
                value={inwardForm.quantity}
                onChange={(e) => setInwardForm({ ...inwardForm, quantity: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              UOM
              <input required value={inwardForm.uom} onChange={(e) => setInwardForm({ ...inwardForm, uom: e.target.value })} />
            </label>
          </div>
          <div className="line-row">
            <label className="field">
              Location
              <select
                required
                value={inwardForm.location_id}
                onChange={(e) => setInwardForm({ ...inwardForm, location_id: e.target.value, warehouse_id: "" })}
              >
                <option value="">Select…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Warehouse
              <select
                required
                value={inwardForm.warehouse_id}
                onChange={(e) => setInwardForm({ ...inwardForm, warehouse_id: e.target.value })}
              >
                <option value="">Select…</option>
                {warehouses
                  .filter((w) => w.location_id === inwardForm.location_id)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Mfg date
              <input
                type="date"
                required
                value={inwardForm.mfg_date}
                onChange={(e) => setInwardForm({ ...inwardForm, mfg_date: e.target.value })}
              />
            </label>
            <label className="field">
              Expiry date
              <input
                type="date"
                required
                value={inwardForm.expiry_date}
                onChange={(e) => setInwardForm({ ...inwardForm, expiry_date: e.target.value })}
              />
            </label>
          </div>
          <div className="line-row">
            <label className="field">
              Transaction type
              <select
                value={inwardForm.transaction_type}
                onChange={(e) =>
                  setInwardForm({ ...inwardForm, transaction_type: e.target.value as typeof inwardForm.transaction_type })
                }
              >
                <option value="INWARD_PURCHASE">Inward purchase</option>
                <option value="STOCK_ADJUSTMENT">Stock adjustment</option>
              </select>
            </label>
            <label className="field">
              Reference
              <input
                value={inwardForm.reference_id}
                onChange={(e) => setInwardForm({ ...inwardForm, reference_id: e.target.value })}
                placeholder="PO number, etc."
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Add stock"}
          </button>
        </form>
      )}

      {showOutward && (
        <form className="stacked-form" onSubmit={handleOutward}>
          <div className="line-row">
            <label className="field">
              Lot
              <select
                required
                value={outwardForm.lot_id}
                onChange={(e) => setOutwardForm({ ...outwardForm, lot_id: e.target.value })}
              >
                <option value="">Select…</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lot_number} ({materialName(l.material_id)}{productName(l.product_id) !== "—" ? productName(l.product_id) : ""}) — on hand {l.quantity_on_hand}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Quantity
              <input
                type="number"
                min={0.0001}
                step="any"
                required
                value={outwardForm.quantity}
                onChange={(e) => setOutwardForm({ ...outwardForm, quantity: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Transaction type
              <select
                value={outwardForm.transaction_type}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, transaction_type: e.target.value as typeof outwardForm.transaction_type })
                }
              >
                <option value="OUTWARD_DISPOSAL">Disposal</option>
                <option value="STOCK_ADJUSTMENT">Stock adjustment</option>
              </select>
            </label>
          </div>
          <label className="field">
            Reason
            <input
              required
              value={outwardForm.reason_notes}
              onChange={(e) => setOutwardForm({ ...outwardForm, reason_notes: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Remove stock"}
          </button>
        </form>
      )}

      <div className="inline-form">
        <label className="field">
          Material
          <select value={availabilityMaterialId} onChange={(e) => setAvailabilityMaterialId(e.target.value)}>
            <option value="">Select…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Location
          <select value={availabilityLocationId} onChange={(e) => setAvailabilityLocationId(e.target.value)}>
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary" type="button" onClick={() => void handleAvailability()}>
          Check availability
        </button>
        {availability && (
          <span className="hint">
            Available: <strong>{availability.qty_available}</strong>
          </span>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <h3>Lots</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lot #</th>
                  <th>Material / Product</th>
                  <th>Location</th>
                  <th>Warehouse</th>
                  <th>Mfg date</th>
                  <th>Expiry</th>
                  <th>On hand</th>
                  <th>UOM</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.lot_number}</td>
                    <td>{l.material_id ? materialName(l.material_id) : productName(l.product_id)}</td>
                    <td>{locationName(l.location_id)}</td>
                    <td>{warehouseName(l.warehouse_id)}</td>
                    <td>{l.mfg_date}</td>
                    <td>{l.expiry_date}</td>
                    <td>{l.quantity_on_hand}</td>
                    <td>{l.uom}</td>
                  </tr>
                ))}
                {lots.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-cell">
                      No inventory lots found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>Ledger (most recent)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Balance after</th>
                  <th>Reference</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 50).map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.created_at).toLocaleString()}</td>
                    <td>{t.transaction_type.replace(/_/g, " ")}</td>
                    <td>{t.quantity}</td>
                    <td>{t.balance_after}</td>
                    <td>{t.reference_id ?? "—"}</td>
                    <td>{t.reason_notes ?? "—"}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No ledger transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
