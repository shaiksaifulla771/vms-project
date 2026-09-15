import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Location, Material, PlanSummary, Product } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { StatusBadge } from "../components/StatusBadge";

export function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<PlanSummary>(`/api/v1/plans/${id}/summary`),
      api.get<Product[]>("/api/v1/products"),
      api.get<Material[]>("/api/v1/materials"),
      api.get<Location[]>("/api/v1/locations"),
    ])
      .then(([s, prods, mats, locs]) => {
        setSummary(s);
        setProducts(prods);
        setMaterials(mats);
        setLocations(locs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load plan"))
      .finally(() => setLoading(false));
  }, [id]);

  const productName = (pid: string) => products.find((p) => p.id === pid)?.name ?? pid.slice(0, 8);
  const materialName = (mid: string) => materials.find((m) => m.id === mid)?.name ?? mid.slice(0, 8);
  const locationName = (lid: string) => locations.find((l) => l.id === lid)?.name ?? lid.slice(0, 8);

  if (loading) return <LoadingState />;
  if (!summary) return <ErrorBanner message={error ?? "Plan not found"} />;

  const { plan, batch_summary, material_summary } = summary;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{plan.plan_number}</h1>
        <StatusBadge status={plan.status} />
      </div>

      <ErrorBanner message={error} />

      <h3>Plan Summary</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Location</th>
              <th>Demand target</th>
              <th>Batch size</th>
              <th>Batches required</th>
            </tr>
          </thead>
          <tbody>
            {plan.products.map((pp) => (
              <tr key={pp.id}>
                <td>{productName(pp.product_id)}</td>
                <td>{locationName(pp.location_id)}</td>
                <td>{pp.demand_target_qty}</td>
                <td>{pp.batch_size_output}</td>
                <td>{pp.batches_required}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Batch Summary</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Location</th>
              <th>Planned batches</th>
              <th>Executed batches</th>
              <th>Completed output</th>
            </tr>
          </thead>
          <tbody>
            {batch_summary.map((row, idx) => (
              <tr key={idx}>
                <td>{productName(row.product_id)}</td>
                <td>{locationName(row.location_id)}</td>
                <td>{row.planned_batches}</td>
                <td>{row.executed_batches}</td>
                <td>{row.completed_output_qty}</td>
              </tr>
            ))}
            {batch_summary.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  No batches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Material Summary</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Required</th>
              <th>Available</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {material_summary.map((row, idx) => (
              <tr key={idx}>
                <td>{materialName(row.material_id)}</td>
                <td>{row.total_required_qty}</td>
                <td>{row.total_available_qty}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
            {material_summary.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
                  No material requirements.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
