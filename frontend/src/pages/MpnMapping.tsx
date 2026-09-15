import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "../api/client";
import type { Material, MaterialVendor, Vendor } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

const EMPTY_FORM = { material_id: "", vendor_id: "", mpn_code: "", moq: 1, lead_time_days: 7 };

export function MpnMapping() {
  const [mappings, setMappings] = useState<MaterialVendor[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materialFilter, setMaterialFilter] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ moq: number; lead_time_days: number }>({
    moq: 1,
    lead_time_days: 7,
  });

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id.slice(0, 8);
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id.slice(0, 8);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = materialFilter ? `?material_id=${materialFilter}` : "";
      const [m, mats, vends] = await Promise.all([
        api.get<MaterialVendor[]>(`/api/v1/mpn${query}`),
        materials.length ? Promise.resolve(materials) : api.get<Material[]>("/api/v1/materials"),
        vendors.length ? Promise.resolve(vendors) : api.get<Vendor[]>("/api/v1/vendors"),
      ]);
      setMappings(m);
      setMaterials(mats);
      setVendors(vends);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load MPN mappings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialFilter]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post<MaterialVendor>("/api/v1/mpn", form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create MPN mapping");
    }
  };

  const startEdit = (m: MaterialVendor) => {
    setEditingId(m.id);
    setEditValues({ moq: Number(m.moq), lead_time_days: m.lead_time_days });
  };

  const saveEdit = async (id: string) => {
    setError(null);
    try {
      await api.patch(`/api/v1/mpn/${id}`, editValues);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update MPN mapping");
    }
  };

  const setPreferred = async (id: string) => {
    setError(null);
    try {
      await api.post(`/api/v1/mpn/${id}/set-preferred`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set preferred vendor");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>MPN Mapping</h1>
        <div className="page-header-actions">
          <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
            <option value="">All materials</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <RoleGate minimum="admin">
            <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New Mapping"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label className="field">
            Material
            <select
              required
              value={form.material_id}
              onChange={(e) => setForm({ ...form, material_id: e.target.value })}
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
            Vendor
            <select
              required
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
            >
              <option value="">Select…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            MPN code
            <input required value={form.mpn_code} onChange={(e) => setForm({ ...form, mpn_code: e.target.value })} />
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
          <button className="btn btn-primary" type="submit">
            Create mapping
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
                <th>MPN code</th>
                <th>Material</th>
                <th>Vendor</th>
                <th>Preferred</th>
                <th>MOQ</th>
                <th>Lead time</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td>{m.mpn_code}</td>
                  <td>{materialName(m.material_id)}</td>
                  <td>{vendorName(m.vendor_id)}</td>
                  <td>{m.is_preferred ? "★" : ""}</td>
                  <td>
                    {editingId === m.id ? (
                      <input
                        type="number"
                        min={0.0001}
                        step="any"
                        value={editValues.moq}
                        onChange={(e) => setEditValues({ ...editValues, moq: Number(e.target.value) })}
                      />
                    ) : (
                      m.moq
                    )}
                  </td>
                  <td>
                    {editingId === m.id ? (
                      <input
                        type="number"
                        min={0}
                        value={editValues.lead_time_days}
                        onChange={(e) =>
                          setEditValues({ ...editValues, lead_time_days: Number(e.target.value) })
                        }
                      />
                    ) : (
                      `${m.lead_time_days}d`
                    )}
                  </td>
                  <td>
                    <StatusBadge status={m.status} />
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
                        <>
                          <button className="btn btn-small btn-secondary" onClick={() => startEdit(m)}>
                            Edit
                          </button>
                          {!m.is_preferred && (
                            <button className="btn btn-small btn-secondary" onClick={() => void setPreferred(m.id)}>
                              Set preferred
                            </button>
                          )}
                        </>
                      )}
                    </RoleGate>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No MPN mappings found.
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
