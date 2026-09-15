import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "../api/client";
import type { Material, VendorPrice, VendorPriceComparisonRow } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";

const EMPTY_FORM = {
  material_vendor_id: "",
  unit_price: 0,
  min_order_qty: 1,
  valid_from: new Date().toISOString().slice(0, 10),
  source: "QUOTE" as const,
};

export function Pricing() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [comparison, setComparison] = useState<VendorPriceComparisonRow[]>([]);
  const [history, setHistory] = useState<VendorPrice[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    api
      .get<Material[]>("/api/v1/materials")
      .then(setMaterials)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load materials"));
  }, []);

  const loadComparison = async (id: string) => {
    setLoading(true);
    setError(null);
    setHistory([]);
    setHistoryFor(null);
    try {
      setComparison(await api.get<VendorPriceComparisonRow[]>(`/api/v1/pricing/material/${id}/compare`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load price comparison");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (materialId) void loadComparison(materialId);
    else setComparison([]);
  }, [materialId]);

  const loadHistory = async (materialVendorId: string) => {
    setError(null);
    try {
      setHistory(await api.get<VendorPrice[]>(`/api/v1/pricing/mpn/${materialVendorId}/history`));
      setHistoryFor(materialVendorId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load price history");
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post<VendorPrice>("/api/v1/pricing", {
        ...form,
        valid_to: null,
      });
      setForm({ ...EMPTY_FORM, material_vendor_id: form.material_vendor_id });
      setShowForm(false);
      if (materialId) await loadComparison(materialId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record price");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Pricing Dashboard</h1>
        <div className="page-header-actions">
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">Select a material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <RoleGate minimum="admin">
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "Record Price"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label className="field">
            MPN mapping id (material_vendor_id)
            <input
              required
              value={form.material_vendor_id}
              onChange={(e) => setForm({ ...form, material_vendor_id: e.target.value })}
              placeholder="from MPN Mapping page"
            />
          </label>
          <label className="field">
            Unit price
            <input
              type="number"
              min={0.0001}
              step="any"
              required
              value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Min order qty
            <input
              type="number"
              min={0.0001}
              step="any"
              value={form.min_order_qty}
              onChange={(e) => setForm({ ...form, min_order_qty: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Valid from
            <input
              type="date"
              required
              value={form.valid_from}
              onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" type="submit">
            Save price
          </button>
        </form>
      )}

      {!materialId ? (
        <p className="muted">Select a material to compare vendor pricing.</p>
      ) : loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>MPN code</th>
                  <th>Preferred</th>
                  <th>Unit price</th>
                  <th>MOQ</th>
                  <th>Valid from</th>
                  <th>Valid to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.material_vendor_id}>
                    <td>{row.vendor_name}</td>
                    <td>{row.mpn_code}</td>
                    <td>{row.is_preferred ? "★" : ""}</td>
                    <td>
                      {row.currency} {row.unit_price}
                    </td>
                    <td>{row.min_order_qty}</td>
                    <td>{row.valid_from}</td>
                    <td>{row.valid_to ?? "current"}</td>
                    <td>
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => void loadHistory(row.material_vendor_id)}
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))}
                {comparison.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-cell">
                      No current pricing for this material.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {historyFor && (
            <>
              <h3>Price history</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Unit price</th>
                      <th>Valid from</th>
                      <th>Valid to</th>
                      <th>Source</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>
                          {h.currency} {h.unit_price}
                        </td>
                        <td>{h.valid_from}</td>
                        <td>{h.valid_to ?? "current"}</td>
                        <td>{h.source}</td>
                        <td>{h.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
