import { useEffect, useState } from "react";

import { api, ApiError } from "../api/client";
import type { VendorScorecardRow } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";

function pct(value: string | null): string {
  return value === null ? "—" : `${Number(value).toFixed(1)}%`;
}

function days(value: string | null): string {
  return value === null ? "—" : `${Number(value).toFixed(1)}d`;
}

export function Analytics() {
  const [rows, setRows] = useState<VendorScorecardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<VendorScorecardRow[]>("/api/v1/analytics/vendor-scorecard")
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vendor Analytics</h1>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Purchase orders</th>
                <th>Total spend</th>
                <th>On-time delivery</th>
                <th>Quality acceptance</th>
                <th>Avg lead time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vendor_id}>
                  <td>{row.vendor_name}</td>
                  <td>{row.total_purchase_orders}</td>
                  <td>{row.total_spend}</td>
                  <td>{pct(row.on_time_delivery_pct)}</td>
                  <td>{pct(row.quality_acceptance_pct)}</td>
                  <td>{days(row.avg_lead_time_days)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No vendor activity recorded yet.
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
