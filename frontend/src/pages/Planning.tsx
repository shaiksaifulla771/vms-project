import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Location, Plan, Product } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

interface DraftLine {
  product_id: string;
  location_id: string;
  demand_target_qty: number;
  batch_size_output: number;
}

const EMPTY_LINE: DraftLine = { product_id: "", location_id: "", demand_target_qty: 1, batch_size_output: 1 };

export function Planning() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, prods, locs] = await Promise.all([
        api.get<Plan[]>("/api/v1/plans"),
        api.get<Product[]>("/api/v1/products"),
        api.get<Location[]>("/api/v1/locations"),
      ]);
      setPlans(planList);
      setProducts(prods);
      setLocations(locs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/plans", { lines });
      setLines([{ ...EMPTY_LINE }]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create plan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Planning</h1>
        <div className="page-header-actions">
          <RoleGate minimum="editor">
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New Plan"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="stacked-form" onSubmit={handleCreate}>
          <h4>Demand lines</h4>
          {lines.map((line, idx) => (
            <div className="line-row" key={idx}>
              <select
                required
                value={line.product_id}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...next[idx], product_id: e.target.value };
                  setLines(next);
                }}
              >
                <option value="">Product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={line.location_id}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...next[idx], location_id: e.target.value };
                  setLines(next);
                }}
              >
                <option value="">Location…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <label className="hint">
                Demand target
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  required
                  value={line.demand_target_qty}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...next[idx], demand_target_qty: Number(e.target.value) };
                    setLines(next);
                  }}
                />
              </label>
              <label className="hint">
                Batch size
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  required
                  value={line.batch_size_output}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...next[idx], batch_size_output: Number(e.target.value) };
                    setLines(next);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                disabled={lines.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-small btn-secondary" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
            Add line
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Computing…" : "Create plan"}
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
                <th>Plan #</th>
                <th>Status</th>
                <th>Products / Locations</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/planning/${p.id}`}>{p.plan_number}</Link>
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>
                    {p.products.map((pp) => `${productName(pp.product_id)} @ ${locationName(pp.location_id)}`).join(", ")}
                  </td>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    No plans found.
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
