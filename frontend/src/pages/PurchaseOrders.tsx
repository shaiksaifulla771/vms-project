import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { PoStatus, PurchaseOrder, Vendor } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { StatusBadge } from "../components/StatusBadge";

export function PurchaseOrders() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PoStatus | "">("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : "";
      const [poList, vends] = await Promise.all([
        api.get<PurchaseOrder[]>(`/api/v1/purchase-orders${query}`),
        vendors.length ? Promise.resolve(vendors) : api.get<Vendor[]>("/api/v1/vendors"),
      ]);
      setPos(poList);
      setVendors(vends);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchase Orders</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PoStatus | "")}>
          <option value="">All statuses</option>
          {["DRAFT", "ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Grand total</th>
                <th>Expected delivery</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id}>
                  <td>
                    <Link to={`/purchase-orders/${po.id}`}>{po.po_number}</Link>
                  </td>
                  <td>{vendorName(po.vendor_id)}</td>
                  <td>
                    <StatusBadge status={po.status} />
                  </td>
                  <td>
                    {po.currency} {po.grand_total}
                  </td>
                  <td>{po.expected_delivery_date ?? "—"}</td>
                </tr>
              ))}
              {pos.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No purchase orders found.
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
