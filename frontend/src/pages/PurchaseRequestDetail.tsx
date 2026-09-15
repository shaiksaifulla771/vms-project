import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type { Material, PurchaseOrder, PurchaseRequest, Vendor } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

interface GroupLineDraft {
  pr_item_id: string;
  vendor_id: string;
  unit_price: number;
  tax_percent: number;
}

export function PurchaseRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [showConvert, setShowConvert] = useState(false);
  const [lineDrafts, setLineDrafts] = useState<GroupLineDraft[]>([]);
  const [createdPos, setCreatedPos] = useState<PurchaseOrder[]>([]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [request, mats, vends] = await Promise.all([
        api.get<PurchaseRequest>(`/api/v1/purchase-requests/${id}`),
        materials.length ? Promise.resolve(materials) : api.get<Material[]>("/api/v1/materials"),
        vendors.length ? Promise.resolve(vendors) : api.get<Vendor[]>("/api/v1/vendors"),
      ]);
      setPr(request);
      setMaterials(mats);
      setVendors(vends);
      setLineDrafts(
        request.items.map((item) => ({
          pr_item_id: item.id,
          vendor_id: item.suggested_vendor_id ?? "",
          unit_price: 0,
          tax_percent: 0,
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load purchase request");
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

  const runAction = async (action: () => Promise<void>) => {
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

  const handleConvert = async () => {
    if (!pr) return;
    setBusy(true);
    setError(null);
    try {
      // Group line drafts by vendor_id -> one PO per vendor, per one-PO-per-vendor rule.
      const byVendor = new Map<string, GroupLineDraft[]>();
      for (const line of lineDrafts) {
        if (!line.vendor_id) throw new Error("Every line needs a vendor assigned before converting");
        const bucket = byVendor.get(line.vendor_id) ?? [];
        bucket.push(line);
        byVendor.set(line.vendor_id, bucket);
      }
      const groups = Array.from(byVendor.entries()).map(([vendor_id, lines]) => ({
        vendor_id,
        lines: lines.map((l) => {
          const item = pr.items.find((i) => i.id === l.pr_item_id)!;
          return {
            pr_item_id: l.pr_item_id,
            quantity: Number(item.quantity),
            unit_price: l.unit_price,
            tax_percent: l.tax_percent,
          };
        }),
      }));
      const idempotencyKey = `${pr.pr_number}-${Date.now()}`;
      const pos = await api.post<PurchaseOrder[]>(`/api/v1/purchase-orders/from-purchase-request/${pr.id}`, {
        idempotency_key: idempotencyKey,
        groups,
      });
      setCreatedPos(pos);
      setShowConvert(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!pr) return <ErrorBanner message={error ?? "Purchase request not found"} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {pr.pr_number} <span className="muted">— {pr.title}</span>
        </h1>
        <StatusBadge status={pr.status} />
      </div>

      <ErrorBanner message={error} />

      <div className="action-row">
        {pr.status === "DRAFT" && (
          <RoleGate minimum="editor">
            <button className="btn btn-secondary" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/purchase-requests/${pr.id}/submit`).then(() => undefined))}>
              Submit for approval
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/purchase-requests/${pr.id}/cancel`).then(() => undefined))}>
              Cancel
            </button>
          </RoleGate>
        )}
        {pr.status === "SUBMITTED" && (
          <RoleGate minimum="admin">
            <input
              placeholder="Decision notes (optional)"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  api
                    .post(`/api/v1/purchase-requests/${pr.id}/approve`, { decision_notes: decisionNotes || null })
                    .then(() => undefined),
                )
              }
            >
              Approve
            </button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  api
                    .post(`/api/v1/purchase-requests/${pr.id}/reject`, { decision_notes: decisionNotes || null })
                    .then(() => undefined),
                )
              }
            >
              Reject
            </button>
          </RoleGate>
        )}
        {pr.status === "APPROVED" && (
          <RoleGate minimum="admin">
            <button className="btn btn-primary" onClick={() => setShowConvert((v) => !v)}>
              {showConvert ? "Cancel conversion" : "Convert to Purchase Order(s)"}
            </button>
          </RoleGate>
        )}
      </div>

      {showConvert && (
        <div className="convert-panel">
          <h3>Assign vendor & price per line</h3>
          {lineDrafts.map((line, idx) => {
            const item = pr.items.find((i) => i.id === line.pr_item_id)!;
            return (
              <div className="line-row" key={line.pr_item_id}>
                <span className="line-material">
                  {materialName(item.material_id)} — {item.quantity} {item.uom}
                </span>
                <select
                  value={line.vendor_id}
                  onChange={(e) => {
                    const next = [...lineDrafts];
                    next[idx] = { ...next[idx], vendor_id: e.target.value };
                    setLineDrafts(next);
                  }}
                >
                  <option value="">Vendor…</option>
                  {vendors
                    .filter((v) => v.status === "APPROVED" || v.status === "ACTIVE")
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  placeholder="Unit price"
                  value={line.unit_price}
                  onChange={(e) => {
                    const next = [...lineDrafts];
                    next[idx] = { ...next[idx], unit_price: Number(e.target.value) };
                    setLineDrafts(next);
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  placeholder="Tax %"
                  value={line.tax_percent}
                  onChange={(e) => {
                    const next = [...lineDrafts];
                    next[idx] = { ...next[idx], tax_percent: Number(e.target.value) };
                    setLineDrafts(next);
                  }}
                />
              </div>
            );
          })}
          <button className="btn btn-primary" disabled={busy} onClick={() => void handleConvert()}>
            Create Purchase Order(s)
          </button>
        </div>
      )}

      {createdPos.length > 0 && (
        <div className="notice-banner">
          Created:{" "}
          {createdPos.map((po, idx) => (
            <span key={po.id}>
              {idx > 0 && ", "}
              <Link to={`/purchase-orders/${po.id}`}>{po.po_number}</Link>
            </span>
          ))}
        </div>
      )}

      <h3>Lines</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Material</th>
              <th>Quantity</th>
              <th>Suggested vendor</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((item) => (
              <tr key={item.id}>
                <td>{item.line_no}</td>
                <td>{materialName(item.material_id)}</td>
                <td>
                  {item.quantity} {item.uom}
                </td>
                <td>{item.suggested_vendor_id ? vendorName(item.suggested_vendor_id) : "—"}</td>
                <td>{item.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pr.decision_notes && (
        <p className="muted">Decision notes: {pr.decision_notes}</p>
      )}
    </div>
  );
}
