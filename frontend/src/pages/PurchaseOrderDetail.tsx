import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Material, PurchaseOrder, Vendor } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiptQty, setReceiptQty] = useState<Record<string, number>>({});

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [order, mats, vends] = await Promise.all([
        api.get<PurchaseOrder>(`/api/v1/purchase-orders/${id}`),
        materials.length ? Promise.resolve(materials) : api.get<Material[]>("/api/v1/materials"),
        vendors.length ? Promise.resolve(vendors) : api.get<Vendor[]>("/api/v1/vendors"),
      ]);
      setPo(order);
      setMaterials(mats);
      setVendors(vends);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load purchase order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const materialName = (matId: string) => materials.find((m) => m.id === matId)?.name ?? matId.slice(0, 8);
  const vendorName = (vId: string) => vendors.find((v) => v.id === vId)?.name ?? vId.slice(0, 8);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReceive = async (poItemId: string) => {
    const qty = receiptQty[poItemId];
    if (!qty || qty <= 0) {
      setError("Enter a received quantity greater than 0");
      return;
    }
    await runAction(() =>
      api.post(`/api/v1/purchase-orders/${id}/receipts`, {
        po_item_id: poItemId,
        received_qty: qty,
        quality_ok: true,
      }),
    );
    setReceiptQty((prev) => ({ ...prev, [poItemId]: 0 }));
  };

  if (loading) return <LoadingState />;
  if (!po) return <ErrorBanner message={error ?? "Purchase order not found"} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {po.po_number} <span className="muted">— {vendorName(po.vendor_id)}</span>
        </h1>
        <StatusBadge status={po.status} />
      </div>

      <ErrorBanner message={error} />

      <div className="action-row">
        {po.status === "DRAFT" && (
          <RoleGate minimum="admin">
            <button className="btn btn-primary" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/purchase-orders/${po.id}/issue`))}>
              Issue PO
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/purchase-orders/${po.id}/cancel`))}>
              Cancel
            </button>
          </RoleGate>
        )}
        {po.status === "RECEIVED" && (
          <RoleGate minimum="admin">
            <button className="btn btn-primary" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/purchase-orders/${po.id}/close`))}>
              Close PO
            </button>
          </RoleGate>
        )}
      </div>

      <dl className="detail-list">
        <dt>Currency</dt>
        <dd>{po.currency}</dd>
        <dt>Subtotal</dt>
        <dd>{po.subtotal}</dd>
        <dt>Tax</dt>
        <dd>{po.tax_total}</dd>
        <dt>Grand total</dt>
        <dd>{po.grand_total}</dd>
        <dt>Expected delivery</dt>
        <dd>{po.expected_delivery_date ?? "—"}</dd>
      </dl>

      <h3>Lines</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Material</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Unit price</th>
              <th>Tax %</th>
              <th>Line total</th>
              {(po.status === "ISSUED" || po.status === "PARTIALLY_RECEIVED") && <th>Record receipt</th>}
            </tr>
          </thead>
          <tbody>
            {po.items.map((item) => {
              const remaining = Number(item.quantity_ordered) - Number(item.quantity_received);
              return (
                <tr key={item.id}>
                  <td>{item.line_no}</td>
                  <td>{materialName(item.material_id)}</td>
                  <td>{item.quantity_ordered}</td>
                  <td>{item.quantity_received}</td>
                  <td>{item.unit_price}</td>
                  <td>{item.tax_percent}</td>
                  <td>{item.line_total}</td>
                  {(po.status === "ISSUED" || po.status === "PARTIALLY_RECEIVED") && (
                    <td>
                      <RoleGate minimum="editor">
                        {remaining > 0 ? (
                          <span className="line-row">
                            <input
                              type="number"
                              min={0.0001}
                              max={remaining}
                              step="any"
                              value={receiptQty[item.id] ?? ""}
                              onChange={(e) =>
                                setReceiptQty((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                              }
                            />
                            <button className="btn btn-small btn-secondary" disabled={busy} onClick={() => void handleReceive(item.id)}>
                              Receive
                            </button>
                          </span>
                        ) : (
                          "Fully received"
                        )}
                      </RoleGate>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
