import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "../api/client";
import type { Location, Warehouse } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";

const EMPTY_LOCATION_FORM = { name: "", code: "", address: "" };
const EMPTY_WAREHOUSE_FORM = { location_id: "", name: "", code: "", is_default: false };

export function Locations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [warehouseForm, setWarehouseForm] = useState(EMPTY_WAREHOUSE_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [locs, whs] = await Promise.all([
        api.get<Location[]>("/api/v1/locations"),
        api.get<Warehouse[]>("/api/v1/warehouses"),
      ]);
      setLocations(locs);
      setWarehouses(whs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load locations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreateLocation = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Location>("/api/v1/locations", { ...locationForm, address: locationForm.address || null });
      setLocationForm(EMPTY_LOCATION_FORM);
      setShowLocationForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create location");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWarehouse = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Warehouse>("/api/v1/warehouses", warehouseForm);
      setWarehouseForm(EMPTY_WAREHOUSE_FORM);
      setShowWarehouseForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create warehouse");
    } finally {
      setSubmitting(false);
    }
  };

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Locations &amp; Warehouses</h1>
        <div className="page-header-actions">
          <RoleGate minimum="admin">
            <button className="btn btn-primary" onClick={() => setShowLocationForm((v) => !v)}>
              {showLocationForm ? "Cancel" : "New Location"}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowWarehouseForm((v) => !v)}>
              {showWarehouseForm ? "Cancel" : "New Warehouse"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showLocationForm && (
        <form className="inline-form" onSubmit={handleCreateLocation}>
          <label className="field">
            Name
            <input
              required
              value={locationForm.name}
              onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
            />
          </label>
          <label className="field">
            Code
            <input
              required
              value={locationForm.code}
              onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })}
            />
          </label>
          <label className="field">
            Address
            <input
              value={locationForm.address}
              onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create location"}
          </button>
          <span className="hint">A default "Main Warehouse" is created automatically for every new location.</span>
        </form>
      )}

      {showWarehouseForm && (
        <form className="inline-form" onSubmit={handleCreateWarehouse}>
          <label className="field">
            Location
            <select
              required
              value={warehouseForm.location_id}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, location_id: e.target.value })}
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
            Name
            <input
              required
              value={warehouseForm.name}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
            />
          </label>
          <label className="field">
            Code
            <input
              required
              value={warehouseForm.code}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="hint">Default warehouse</span>
            <input
              type="checkbox"
              checked={warehouseForm.is_default}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, is_default: e.target.checked })}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create warehouse"}
          </button>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <h3>Locations</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Warehouses</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td>{l.address ?? "—"}</td>
                    <td>{warehouses.filter((w) => w.location_id === l.id).length}</td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      No locations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>Warehouses</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id}>
                    <td className="mono">{w.code}</td>
                    <td>{w.name}</td>
                    <td>{locationName(w.location_id)}</td>
                    <td>{w.is_default ? "★" : ""}</td>
                  </tr>
                ))}
                {warehouses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      No warehouses found.
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
