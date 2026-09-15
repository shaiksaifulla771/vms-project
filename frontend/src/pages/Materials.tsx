import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "../api/client";
import type { ItemClassification, MasterDataStatus, Material } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

const CLASSIFICATIONS: ItemClassification[] = ["RAW_MATERIAL", "PACKAGING", "EMULSIFIER", "CONSUMABLE", "FINISHED_GOOD"];

const EMPTY_FORM = {
  code: "",
  name: "",
  classification: "RAW_MATERIAL" as ItemClassification,
  uom: "kg",
  hsn_code: "",
  safety_stock: 0,
  reorder_point: 0,
  moq: 1,
  lead_time_days: 7,
  is_hazardous: false,
};

export function Materials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MasterDataStatus | "">("");
  const [classFilter, setClassFilter] = useState<ItemClassification | "">("");
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
      setMaterials(await api.get<Material[]>(`/api/v1/materials${query}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const visible = classFilter ? materials.filter((m) => m.classification === classFilter) : materials;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Material>("/api/v1/materials", { ...form, hsn_code: form.hsn_code || null });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create material");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (m: Material) => {
    setEditingId(m.id);
    setEditValues({ status: m.status });
  };

  const saveEdit = async (id: string) => {
    setError(null);
    try {
      await api.patch(`/api/v1/materials/${id}`, { status: editValues.status });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update material");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Materials</h1>
        <div className="page-header-actions">
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value as ItemClassification | "")}>
            <option value="">All classifications</option>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
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
              {showForm ? "Cancel" : "New Material"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="stacked-form" onSubmit={handleCreate}>
          <div className="line-row">
            <label className="field">
              Code
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label className="field">
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              Classification
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value as ItemClassification })}
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              UOM
              <input required value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
            </label>
          </div>
          <div className="line-row">
            <label className="field">
              HSN code
              <input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} />
            </label>
            <label className="field">
              Safety stock
              <input
                type="number"
                min={0}
                step="any"
                value={form.safety_stock}
                onChange={(e) => setForm({ ...form, safety_stock: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Reorder point
              <input
                type="number"
                min={0}
                step="any"
                value={form.reorder_point}
                onChange={(e) => setForm({ ...form, reorder_point: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              MOQ
              <input
                type="number"
                min={0.0001}
                step="any"
                value={form.moq}
                onChange={(e) => setForm({ ...form, moq: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Lead time (days)
              <input
                type="number"
                min={0}
                value={form.lead_time_days}
                onChange={(e) => setForm({ ...form, lead_time_days: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={form.is_hazardous}
              onChange={(e) => setForm({ ...form, is_hazardous: e.target.checked })}
            />
            Hazardous
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create material"}
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
                <th>Code</th>
                <th>Name</th>
                <th>Classification</th>
                <th>UOM</th>
                <th>Safety stock</th>
                <th>Reorder point</th>
                <th>MOQ</th>
                <th>Lead time</th>
                <th>Hazardous</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.code}</td>
                  <td>{m.name}</td>
                  <td>{m.classification.replace(/_/g, " ")}</td>
                  <td>{m.uom}</td>
                  <td>{m.safety_stock}</td>
                  <td>{m.reorder_point}</td>
                  <td>{m.moq}</td>
                  <td>{m.lead_time_days}d</td>
                  <td>{m.is_hazardous ? "⚠" : ""}</td>
                  <td>
                    {editingId === m.id ? (
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
                      <StatusBadge status={m.status} />
                    )}
                  </td>
                  <td className="row-actions">
                    <RoleGate minimum="admin">
                      {editingId === m.id ? (
                        <>
                          <button className="btn btn-small btn-primary" onClick={() => void saveEdit(m.id)}>
                            Save
                          </button>
                          <button className="btn btn-small btn-ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-small btn-secondary" onClick={() => startEdit(m)}>
                          Edit
                        </button>
                      )}
                    </RoleGate>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty-cell">
                    No materials found.
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
