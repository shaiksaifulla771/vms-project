import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { api, ApiError } from "../api/client";
import type {
  Batch,
  BatchActualInput,
  Bom,
  InventoryLot,
  Location,
  Material,
  Warehouse,
} from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { RoleGate } from "../components/RoleGate";
import { StatusBadge } from "../components/StatusBadge";

interface DraftInputLine {
  material_id: string;
  actual_input_qty: number;
  consumed_lot_id: string;
  reason_notes: string;
}

export function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [inputs, setInputs] = useState<BatchActualInput[]>([]);
  const [bom, setBom] = useState<Bom | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [completeLines, setCompleteLines] = useState<DraftInputLine[]>([]);
  const [actualOutputQty, setActualOutputQty] = useState(0);
  const [outputVarianceReason, setOutputVarianceReason] = useState("");

  const [showOutputCorrection, setShowOutputCorrection] = useState(false);
  const [outputCorrectionQty, setOutputCorrectionQty] = useState(0);
  const [outputCorrectionReason, setOutputCorrectionReason] = useState("");

  const [inputCorrection, setInputCorrection] = useState<{
    inputId: string;
    lotId: string;
    newQuantity: number;
    reason: string;
  } | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const b = await api.get<Batch>(`/api/v1/batches/${id}`);
      const [ins, boms, mats, locs, whs, lotList] = await Promise.all([
        api.get<BatchActualInput[]>(`/api/v1/batches/${id}/inputs`),
        api.get<Bom[]>(`/api/v1/products/${b.product_id}/boms`),
        api.get<Material[]>("/api/v1/materials"),
        api.get<Location[]>("/api/v1/locations"),
        api.get<Warehouse[]>("/api/v1/warehouses"),
        api.get<InventoryLot[]>(`/api/v1/inventory/lots?location_id=${b.location_id}&warehouse_id=${b.warehouse_id}`),
      ]);
      setBatch(b);
      setInputs(ins);
      const activeBom = boms.find((x) => x.is_active) ?? null;
      setBom(activeBom);
      setMaterials(mats);
      setLocations(locs);
      setWarehouses(whs);
      setLots(lotList);
      if (activeBom) {
        setCompleteLines(
          activeBom.items.map((item) => ({
            material_id: item.material_id,
            actual_input_qty: 0,
            consumed_lot_id: "",
            reason_notes: "",
          })),
        );
      }
      setActualOutputQty(Number(b.planned_output_qty));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load batch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const materialName = (matId: string) => materials.find((m) => m.id === matId)?.name ?? matId.slice(0, 8);
  const locationName = (lid: string) => locations.find((l) => l.id === lid)?.name ?? lid.slice(0, 8);
  const warehouseName = (wid: string) => warehouses.find((w) => w.id === wid)?.name ?? wid.slice(0, 8);
  const lotNumber = (lotId: string) => lots.find((l) => l.id === lotId)?.lot_number ?? lotId.slice(0, 8);

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

  const handleComplete = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(() =>
      api.post(`/api/v1/batches/${id}/complete`, {
        actual_output_qty: actualOutputQty,
        output_variance_reason: outputVarianceReason || null,
        input_lines: completeLines.map((l) => ({
          material_id: l.material_id,
          actual_input_qty: l.actual_input_qty,
          consumed_lot_id: l.consumed_lot_id || null,
          reason_notes: l.reason_notes || null,
        })),
      }),
    );
  };

  const handleOutputCorrection = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(() =>
      api.post(`/api/v1/batches/${id}/correct-output`, {
        new_actual_output_qty: outputCorrectionQty,
        reason_notes: outputCorrectionReason,
      }),
    );
    setShowOutputCorrection(false);
    setOutputCorrectionReason("");
  };

  const handleInputCorrection = async (inputId: string, event: FormEvent) => {
    event.preventDefault();
    if (!inputCorrection) return;
    await runAction(() =>
      api.post(`/api/v1/batches/${id}/actual-inputs/${inputId}/correct`, {
        consumed_lot_id: inputCorrection.lotId,
        new_quantity: inputCorrection.newQuantity,
        reason_notes: inputCorrection.reason,
      }),
    );
    setInputCorrection(null);
  };

  if (loading) return <LoadingState />;
  if (!batch) return <ErrorBanner message={error ?? "Batch not found"} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{batch.batch_number}</h1>
        <StatusBadge status={batch.status} />
      </div>

      <ErrorBanner message={error} />

      <h3>Batch Details</h3>
      <dl className="detail-list">
        <dt>Location</dt>
        <dd>{locationName(batch.location_id)}</dd>
        <dt>Warehouse</dt>
        <dd>{warehouseName(batch.warehouse_id)}</dd>
        <dt>Mfg date</dt>
        <dd>{batch.mfg_date}</dd>
        <dt>Expiry date</dt>
        <dd>{batch.expiry_date}</dd>
        <dt>Executed by</dt>
        <dd>{batch.executed_by}</dd>
      </dl>

      <div className="action-row">
        {batch.status === "SCHEDULED" && (
          <RoleGate minimum="editor">
            <button className="btn btn-primary" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/batches/${batch.id}/start`))}>
              Start batch
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/batches/${batch.id}/cancel`))}>
              Cancel
            </button>
          </RoleGate>
        )}
        {batch.status === "IN_PROGRESS" && (
          <RoleGate minimum="editor">
            <button className="btn btn-ghost" disabled={busy} onClick={() => runAction(() => api.post(`/api/v1/batches/${batch.id}/cancel`))}>
              Cancel batch
            </button>
          </RoleGate>
        )}
      </div>

      {batch.status === "IN_PROGRESS" && bom && (
        <form className="stacked-form" onSubmit={handleComplete}>
          <h3>Complete Batch — Output vs Plan</h3>
          <div className="line-row">
            <label className="field">
              Planned output
              <input disabled value={batch.planned_output_qty} />
            </label>
            <label className="field">
              Actual output qty
              <input
                type="number"
                min={0.0001}
                step="any"
                required
                value={actualOutputQty}
                onChange={(e) => setActualOutputQty(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Variance reason (required if over tolerance)
              <input value={outputVarianceReason} onChange={(e) => setOutputVarianceReason(e.target.value)} />
            </label>
          </div>

          <h4>Material Inputs (BOM) — Actual vs Plan</h4>
          {completeLines.map((line, idx) => (
            <div className="line-row" key={line.material_id}>
              <span className="line-material">{materialName(line.material_id)}</span>
              <label className="hint">
                Actual qty
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  required
                  value={line.actual_input_qty}
                  onChange={(e) => {
                    const next = [...completeLines];
                    next[idx] = { ...next[idx], actual_input_qty: Number(e.target.value) };
                    setCompleteLines(next);
                  }}
                />
              </label>
              <label className="hint">
                Lot override (optional — FEFO by default)
                <select
                  value={line.consumed_lot_id}
                  onChange={(e) => {
                    const next = [...completeLines];
                    next[idx] = { ...next[idx], consumed_lot_id: e.target.value };
                    setCompleteLines(next);
                  }}
                >
                  <option value="">FEFO (automatic)</option>
                  {lots
                    .filter((l) => l.material_id === line.material_id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lot_number} (on hand {l.quantity_on_hand})
                      </option>
                    ))}
                </select>
              </label>
              <label className="hint">
                Reason (required if override or over tolerance)
                <input
                  value={line.reason_notes}
                  onChange={(e) => {
                    const next = [...completeLines];
                    next[idx] = { ...next[idx], reason_notes: e.target.value };
                    setCompleteLines(next);
                  }}
                />
              </label>
            </div>
          ))}

          <RoleGate minimum="editor">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Completing…" : "Complete batch"}
            </button>
          </RoleGate>
        </form>
      )}

      {batch.status === "COMPLETED" && (
        <>
          <h3>Output vs Plan</h3>
          <dl className="detail-list">
            <dt>Planned output</dt>
            <dd>{batch.planned_output_qty}</dd>
            <dt>Actual output</dt>
            <dd>{batch.actual_output_qty}</dd>
            <dt>Variance</dt>
            <dd>
              {batch.output_variance_qty} ({batch.output_variance_pct}%)
            </dd>
            <dt>Reason</dt>
            <dd>{batch.output_variance_reason ?? "—"}</dd>
          </dl>

          <RoleGate minimum="editor">
            <div className="action-row">
              <button className="btn btn-secondary" onClick={() => setShowOutputCorrection((v) => !v)}>
                {showOutputCorrection ? "Cancel correction" : "Dynamic OP Correction"}
              </button>
            </div>
          </RoleGate>

          {showOutputCorrection && (
            <form className="inline-form" onSubmit={handleOutputCorrection}>
              <label className="field">
                New actual output qty
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  required
                  value={outputCorrectionQty || Number(batch.actual_output_qty)}
                  onChange={(e) => setOutputCorrectionQty(Number(e.target.value))}
                />
              </label>
              <label className="field">
                Reason (mandatory)
                <input
                  required
                  value={outputCorrectionReason}
                  onChange={(e) => setOutputCorrectionReason(e.target.value)}
                />
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Post correction
              </button>
            </form>
          )}

          <h3>Material Inputs (BOM) — Actual vs Plan</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>BOM %</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Variance %</th>
                  <th>Reason</th>
                  <th>Lots consumed</th>
                  <RoleGate minimum="editor">
                    <th>Dynamic IP Correction</th>
                  </RoleGate>
                </tr>
              </thead>
              <tbody>
                {inputs.map((input) => (
                  <tr key={input.id}>
                    <td>{materialName(input.material_id)}</td>
                    <td>{input.bom_percentage}</td>
                    <td>{input.planned_input_qty}</td>
                    <td>{input.actual_input_qty}</td>
                    <td>{input.variance_pct}</td>
                    <td>{input.variance_reason ?? "—"}</td>
                    <td>
                      {input.lots.map((l) => (
                        <div key={l.id}>
                          {lotNumber(l.consumed_lot_id)}: {l.quantity}
                        </div>
                      ))}
                    </td>
                    <RoleGate minimum="editor">
                      <td>
                        {inputCorrection?.inputId === input.id ? (
                          <form className="line-row" onSubmit={(e) => void handleInputCorrection(input.id, e)}>
                            <select
                              required
                              value={inputCorrection.lotId}
                              onChange={(e) => setInputCorrection({ ...inputCorrection, lotId: e.target.value })}
                            >
                              <option value="">Lot…</option>
                              {input.lots.map((l) => (
                                <option key={l.id} value={l.consumed_lot_id}>
                                  {lotNumber(l.consumed_lot_id)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0.0001}
                              step="any"
                              required
                              placeholder="New qty"
                              value={inputCorrection.newQuantity || ""}
                              onChange={(e) =>
                                setInputCorrection({ ...inputCorrection, newQuantity: Number(e.target.value) })
                              }
                            />
                            <input
                              required
                              placeholder="Reason"
                              value={inputCorrection.reason}
                              onChange={(e) => setInputCorrection({ ...inputCorrection, reason: e.target.value })}
                            />
                            <button className="btn btn-small btn-primary" type="submit" disabled={busy}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-ghost"
                              onClick={() => setInputCorrection(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button
                            className="btn btn-small btn-secondary"
                            onClick={() =>
                              setInputCorrection({ inputId: input.id, lotId: "", newQuantity: 0, reason: "" })
                            }
                          >
                            Correct
                          </button>
                        )}
                      </td>
                    </RoleGate>
                  </tr>
                ))}
                {inputs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-cell">
                      No actual input lines recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
