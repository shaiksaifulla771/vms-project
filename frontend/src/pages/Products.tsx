import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { MasterDataStatus, Product } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

const EMPTY_FORM = { sku: "", name: "", uom: "units", pack_size: "" };

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MasterDataStatus | "">("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ status: MasterDataStatus }>({ status: "ACTIVE" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : "";
      setProducts(await api.get<Product[]>(`/api/v1/products${query}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Product>("/api/v1/products", {
        ...form,
        pack_size: form.pack_size ? Number(form.pack_size) : null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditValues({ status: p.status });
  };

  const saveEdit = async (id: string) => {
    setError(null);
    try {
      await api.patch(`/api/v1/products/${id}`, { status: editValues.status });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update product");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Products</h1>
        <div className="page-header-actions">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MasterDataStatus | "")}>
            <option value="">All statuses</option>
            {["DRAFT", "ACTIVE", "INACTIVE"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <RoleGate minimum="admin">
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New Product"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label className="field">
            SKU
            <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </label>
          <label className="field">
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            UOM
            <input required value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
          </label>
          <label className="field">
            Pack size
            <input
              type="number"
              min={0.0001}
              step="any"
              value={form.pack_size}
              onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
              placeholder="optional"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create product"}
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
                <th>SKU</th>
                <th>Name</th>
                <th>UOM</th>
                <th>Pack size</th>
                <th>Status</th>
                <th>BOM</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.uom}</td>
                  <td>{p.pack_size ?? "—"}</td>
                  <td>
                    {editingId === p.id ? (
                      <select
                        value={editValues.status}
                        onChange={(e) => setEditValues({ status: e.target.value as MasterDataStatus })}
                      >
                        {["DRAFT", "ACTIVE", "INACTIVE"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge status={p.status} />
                    )}
                  </td>
                  <td>
                    <Link to={`/bom?product_id=${p.id}`}>View / Create BOM</Link>
                  </td>
                  <td className="row-actions">
                    <RoleGate minimum="admin">
                      {editingId === p.id ? (
                        <>
                          <button className="btn btn-small btn-primary" onClick={() => void saveEdit(p.id)}>
                            Save
                          </button>
                          <button className="btn btn-small btn-ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-small btn-secondary" onClick={() => startEdit(p)}>
                          Edit
                        </button>
                      )}
                    </RoleGate>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No products found.
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
