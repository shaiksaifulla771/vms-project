import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Bom, Material, Product } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

interface DraftLine {
  material_id: string;
  formula_percentage: number;
  standard_qty: number;
  uom: string;
}

const EMPTY_LINE: DraftLine = { material_id: "", formula_percentage: 0, standard_qty: 0, uom: "kg" };

export function BomPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = searchParams.get("product_id") ?? "";

  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id.slice(0, 8);

  const loadMasters = async () => {
    try {
      const [prods, mats] = await Promise.all([
        api.get<Product[]>("/api/v1/products"),
        api.get<Material[]>("/api/v1/materials"),
      ]);
      setProducts(prods);
      setMaterials(mats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products/materials");
    }
  };

  const loadBoms = async (pid: string) => {
    if (!pid) {
      setBoms([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setBoms(await api.get<Bom[]>(`/api/v1/products/${pid}/boms`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load BOMs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMasters();
  }, []);

  useEffect(() => {
    void loadBoms(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const nextVersion = boms.length > 0 ? Math.max(...boms.map((b) => b.version)) + 1 : 1;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!productId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Bom>(`/api/v1/products/${productId}/boms`, {
        product_id: productId,
        version: nextVersion,
        is_active: isActive,
        items: lines.map((l) => ({
          material_id: l.material_id,
          formula_percentage: l.formula_percentage,
          standard_qty: l.standard_qty,
          uom: l.uom,
        })),
      });
      setLines([{ ...EMPTY_LINE }]);
      setIsActive(true);
      setShowForm(false);
      await loadBoms(productId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create BOM");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadBoms(productId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const totalPct = lines.reduce((sum, l) => sum + (Number(l.formula_percentage) || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Bill of Materials (Recipe)</h1>
        <div className="page-header-actions">
          <select value={productId} onChange={(e) => setSearchParams(e.target.value ? { product_id: e.target.value } : {})}>
            <option value="">Select a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          <RoleGate minimum="admin">
            <button className="btn btn-primary" disabled={!productId} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "Create BOM"}
            </button>
          </RoleGate>
        </div>
      </div>

      <ErrorBanner message={error} />

      {!productId ? (
        <p className="muted">Select a product to view or create its BOM (recipe).</p>
      ) : (
        <>
          {showForm && (
            <form className="stacked-form" onSubmit={handleCreate}>
              <div className="line-row">
                <span className="hint">Version {nextVersion}</span>
                <label className="hint">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Set active
                </label>
                <span className="hint">
                  Total formula %: <strong>{totalPct.toFixed(3)}</strong>
                </span>
              </div>

              <h4>Recipe lines</h4>
              {lines.map((line, idx) => (
                <div className="line-row" key={idx}>
                  <select
                    required
                    value={line.material_id}
                    onChange={(e) => {
                      const next = [...lines];
                      const mat = materials.find((m) => m.id === e.target.value);
                      next[idx] = { ...next[idx], material_id: e.target.value, uom: mat?.uom ?? next[idx].uom };
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
                  <label className="hint">
                    Formula %
                    <input
                      type="number"
                      min={0.001}
                      max={100}
                      step="any"
                      required
                      value={line.formula_percentage}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], formula_percentage: Number(e.target.value) };
                        setLines(next);
                      }}
                    />
                  </label>
                  <label className="hint">
                    Standard qty
                    <input
                      type="number"
                      min={0.0001}
                      step="any"
                      required
                      value={line.standard_qty}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], standard_qty: Number(e.target.value) };
                        setLines(next);
                      }}
                    />
                  </label>
                  <input
                    className="hint"
                    style={{ width: 70 }}
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
                {submitting ? "Creating…" : "Create BOM"}
              </button>
            </form>
          )}

          {loading ? (
            <LoadingState />
          ) : (
            boms
              .slice()
              .sort((a, b) => b.version - a.version)
              .map((bom) => (
                <div key={bom.id} className="stacked-form">
                  <div className="page-header">
                    <h3>
                      Version {bom.version} {bom.is_active && <StatusBadge status="ACTIVE" />}
                    </h3>
                    <RoleGate minimum="admin">
                      {bom.is_active ? (
                        <button
                          className="btn btn-small btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            runAction(() => api.post(`/api/v1/products/${productId}/boms/${bom.id}/deactivate`))
                          }
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn btn-small btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            runAction(() => api.post(`/api/v1/products/${productId}/boms/${bom.id}/activate`))
                          }
                        >
                          Activate
                        </button>
                      )}
                    </RoleGate>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Formula %</th>
                          <th>Standard qty</th>
                          <th>UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bom.items.map((item) => (
                          <tr key={item.id}>
                            <td>{materialName(item.material_id)}</td>
                            <td>{item.formula_percentage}</td>
                            <td>{item.standard_qty}</td>
                            <td>{item.uom}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}
          {!loading && boms.length === 0 && <p className="muted">No BOM created yet for this product.</p>}
        </>
      )}
    </div>
  );
}
