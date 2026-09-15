import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { MaterialVendor, Vendor, VendorStatus } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

const NEXT_STATUS: Record<VendorStatus, VendorStatus[]> = {
  DRAFT: ["APPROVED", "BLACKLISTED"],
  APPROVED: ["ACTIVE", "SUSPENDED", "BLACKLISTED"],
  ACTIVE: ["SUSPENDED", "BLACKLISTED"],
  SUSPENDED: ["ACTIVE", "BLACKLISTED"],
  BLACKLISTED: [],
};

export function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [mpns, setMpns] = useState<MaterialVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [v, m] = await Promise.all([
        api.get<Vendor>(`/api/v1/vendors/${id}`),
        api.get<MaterialVendor[]>(`/api/v1/mpn?vendor_id=${id}`),
      ]);
      setVendor(v);
      setMpns(m);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load vendor");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusChange = async (status: VendorStatus) => {
    if (!id) return;
    setChangingStatus(true);
    setError(null);
    try {
      await api.post(`/api/v1/vendors/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change vendor status");
    } finally {
      setChangingStatus(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!vendor) return <ErrorBanner message={error ?? "Vendor not found"} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {vendor.name} <span className="muted">({vendor.code})</span>
        </h1>
        <StatusBadge status={vendor.status} />
      </div>

      <ErrorBanner message={error} />

      <RoleGate minimum="admin">
        <div className="action-row">
          {NEXT_STATUS[vendor.status].map((s) => (
            <button
              key={s}
              className="btn btn-secondary"
              disabled={changingStatus}
              onClick={() => void handleStatusChange(s)}
            >
              Move to {s}
            </button>
          ))}
        </div>
      </RoleGate>

      <div className="detail-grid">
        <div>
          <h3>Details</h3>
          <dl className="detail-list">
            <dt>Legal name</dt>
            <dd>{vendor.legal_name ?? "—"}</dd>
            <dt>Contact email</dt>
            <dd>{vendor.contact_email ?? "—"}</dd>
            <dt>Phone</dt>
            <dd>{vendor.phone ?? "—"}</dd>
            <dt>GSTIN</dt>
            <dd>{vendor.gstin ?? "—"}</dd>
            <dt>PAN</dt>
            <dd>{vendor.pan ?? "—"}</dd>
            <dt>Payment terms</dt>
            <dd>{vendor.payment_terms_days} days</dd>
            <dt>Credit limit</dt>
            <dd>{vendor.credit_limit}</dd>
            <dt>Address</dt>
            <dd>
              {[vendor.address_line1, vendor.address_line2, vendor.city, vendor.state, vendor.country, vendor.postal_code]
                .filter(Boolean)
                .join(", ") || "—"}
            </dd>
          </dl>
        </div>

        <div>
          <h3>Materials supplied (MPN)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>MPN code</th>
                  <th>Material</th>
                  <th>Preferred</th>
                  <th>MOQ</th>
                  <th>Lead time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mpns.map((m) => (
                  <tr key={m.id}>
                    <td>{m.mpn_code}</td>
                    <td className="mono">{m.material_id.slice(0, 8)}</td>
                    <td>{m.is_preferred ? "★" : ""}</td>
                    <td>{m.moq}</td>
                    <td>{m.lead_time_days}d</td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
                {mpns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No materials mapped to this vendor yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
