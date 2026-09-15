import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Material, PrStatus, PurchaseRequest } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

interface DraftLine {
  material_id: string;
  quantity: number;
  uom: string;
}

const EMPTY_LINE: DraftLine = { material_id: "", quantity: 1, uom: "kg" };

export function PurchaseRequests() {
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PrStatus | "">("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [justification, setJustification] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : "";
      const [prList, mats] = await Promise.all([
        api.get<PurchaseRequest[]>(`/api/v1/purchase-requests${query}`),
        materials.length ? Promise.resolve(materials) : api.get<Material[]>("/api/v1/materials"),
      ]);
      setPrs(prList);
      setMaterials(mats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load purchase requests");
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
      await api.post("/api/v1/purchase-requests", {
        title,
        required_by: requiredBy,
        justification: justification || null,
        items: lines.map((l) => ({ material_id: l.material_id, quantity: l.quantity, uom: l.uom })),
      });
      setTitle("");
      setRequiredBy("");
      setJustification("");
      setLines([{ ...EMPTY_LINE }]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create purchase request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchase Requests</h1>
        <div className="page-header-actions">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PrStatus | "")}>
            <option value="">All statuses</option>
            {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CONVERTED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <RoleGate minimum="editor">
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New Request"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="stacked-form" onSubmit={handleCreate}>
          <label className="field">
            Title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            Required by
            <input type="date" required value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          </label>
          <label className="field">
            Justification
            <textarea value={justification} onChange={(e) => setJustification(e.target.value)} />
          </label>

          <h4>Lines</h4>
          {lines.map((line, idx) => (
            <div className="line-row" key={idx}>
              <select
                required
                value={line.material_id}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...next[idx], material_id: e.target.value };
                  setLines(next);
                }}
              >
                <option value="">Material…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0.0001}
                step="any"
                required
                value={line.quantity}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                  setLines(next);
                }}
              />
              <input
                value={line.uom}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...next[idx], uom: e.target.value };
                  setLines(next);
                }}
              />
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
            {submitting ? "Creating…" : "Create purchase request"}
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
                <th>PR #</th>
                <th>Title</th>
                <th>Status</th>
                <th>Required by</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <Link to={`/purchase-requests/${pr.id}`}>{pr.pr_number}</Link>
                  </td>
                  <td>{pr.title}</td>
                  <td>
                    <StatusBadge status={pr.status} />
                  </td>
                  <td>{pr.required_by}</td>
                  <td>{pr.items.length}</td>
                </tr>
              ))}
              {prs.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No purchase requests found.
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
