import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Batch, BatchStatus, Location, Plan, Product, Warehouse } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  plan_id: "",
  product_id: "",
  location_id: "",
  warehouse_id: "",
  planned_output_qty: 1,
  mfg_date: TODAY,
  expiry_date: "",
  executed_by: "",
};

export function Batches() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BatchStatus | "">("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : "";
      const [batchList, planList, prods, locs, whs] = await Promise.all([
        api.get<Batch[]>(`/api/v1/batches${query}`),
        api.get<Plan[]>("/api/v1/plans"),
        api.get<Product[]>("/api/v1/products"),
        api.get<Location[]>("/api/v1/locations"),
        api.get<Warehouse[]>("/api/v1/warehouses"),
      ]);
      setBatches(batchList);
      setPlans(planList);
      setProducts(prods);
      setLocations(locs);
      setWarehouses(whs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load batches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/batches", { ...form, plan_id: form.plan_id || null });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create batch");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Batches</h1>
        <div className="page-header-actions">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BatchStatus | "")}>
            <option value="">All statuses</option>
            {["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <RoleGate minimum="editor">
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New Batch"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="stacked-form" onSubmit={handleCreate}>
          <label className="field">
            Plan (optional — leave blank for an ad-hoc batch)
            <select value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
              <option value="">None</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plan_number}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Product
            <select required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="line-row">
            <label className="field">
              Location
              <select
                required
                value={form.location_id}
                onChange={(e) => setForm({ ...form, location_id: e.target.value, warehouse_id: "" })}
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
              <select required value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
                <option value="">Select…</option>
                {warehouses
                  .filter((w) => w.location_id === form.location_id)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="line-row">
            <label className="field">
              Planned output qty
              <input
                type="number"
                min={0.0001}
                step="any"
                required
                value={form.planned_output_qty}
                onChange={(e) => setForm({ ...form, planned_output_qty: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Mfg date
              <input type="date" required value={form.mfg_date} onChange={(e) => setForm({ ...form, mfg_date: e.target.value })} />
            </label>
            <label className="field">
              Expiry date
              <input
                type="date"
                required
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            Executed by (operator name/badge)
            <input required value={form.executed_by} onChange={(e) => setForm({ ...form, executed_by: e.target.value })} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create batch"}
          </button>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Product</th>
                <th>Location</th>
                <th>Status</th>
                <th>Planned output</th>
                <th>Actual output</th>
                <th>Variance %</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/batches/${b.id}`}>{b.batch_number}</Link>
                  </td>
                  <td>{productName(b.product_id)}</td>
                  <td>{locationName(b.location_id)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td>{b.planned_output_qty}</td>
                  <td>{b.actual_output_qty ?? "—"}</td>
                  <td>{b.output_variance_pct ?? "—"}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No batches found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
