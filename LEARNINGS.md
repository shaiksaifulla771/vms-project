# Learnings Log

**Target location:** repo root (or `.agent/LEARNINGS.md`) — referenced by `project-rules.md` §3.

Read entries relevant to the module about to be touched before starting a task. Append a new entry before closing out any task where something broke or was corrected. Never delete — mark `[RESOLVED]` or `[SUPERSEDED]` instead.

**Entry format:**
```
## YYYY-MM-DD — <short title> [module/files]
- What was tried:
- What broke:
- Root cause:
- Rule going forward:
```

---

## Example entry — delete once real ones exist

## 2026-08-27 — Negative stock on cancelled PO [inventory/po-service]
- What was tried: Cancelling a PO decremented reserved stock without checking fulfillment status.
- What broke: Stock count went negative for partially-fulfilled POs.
- Root cause: The cancellation handler didn't check current fulfillment state before adjusting reserved quantity.
- Rule going forward: Any status transition on a PO must check fulfillment state before touching inventory — see `project-rules.md` §5.2.

## 2026-08-27 — Failed to save batch to database on Material bulk ingestion [masters/materialBulkService]
- What was tried: Ingesting or bulk updating materials via spreadsheet or batch API (`/api/materials/batch` and `/api/materials/batch-upload`).
- What broke: Ingestion threw `Failed to save batch to database` (`ValidationError: InventoryItem validation failed: warehouseId: Warehouse reference is required`).
- Root cause: `materialBulkService.js` was executing an un-scoped `InventoryItem.bulkWrite` with only `{ materialId, balance: 0 }`, violating `InventoryItem` schema's mandatory `warehouseId` reference constraint.
- Rule going forward: Master record definitions (e.g. Materials/Vendors) must not instantiate orphaned child transactional or warehouse records without explicit site/warehouse context. Error handlers in UI components must surface `err.response?.data?.error` rather than masking root causes behind generic toasts.

## 2026-08-27 — Warehouse reference is required on QC Inspection completion [quality/qualityController]
- What was tried: Submitting a "Passed" quality inspection check for a completed production run.
- What broke: QC completion failed with `ValidationError: InventoryItem validation failed: warehouseId: Warehouse reference is required` / `InventoryTransaction validation failed: warehouseId: Warehouse reference is required`.
- Root cause: `qualityController.js` created `InventoryItem` and `InventoryTransaction` documents directly using only `{ materialId: finishedProduct }` without attaching the target `warehouseId` from the production order or default warehouse.
- Rule going forward: All production receipts and quality sign-offs must route physical stock through `InventoryLedgerService.recordTransaction` with resolved `warehouseId` and `siteId` contexts.

## 2026-08-28 — MongoDB Repeated Auto-Restarts & Process Crashing [database/backend-resilience]
- What was tried: Connecting backend server to MongoDB Atlas cluster on Windows with `node --watch`.
- What broke: Server went into an infinite auto-restart loop and logged `MongoServerSelectionError: getaddrinfo ENOTFOUND` and `SSL alert number 80`.
- Root cause:
  1. `process.on('unhandledRejection')` in `server.js` was calling `process.exit(1)` on transient MongoDB connection drops, triggering `node --watch` to endlessly restart `server.js`.
  2. `node --watch` was watching the entire workspace without path scoping, triggering restarts on log/temp file writes.
  3. Background timers (such as email queue poller) queried MongoDB without verifying `mongoose.connection.readyState === 1`.
  4. Atlas dynamic IP whitelisting or DNS hiccups triggered unhandled rejections without graceful offline fallback.
- Rule going forward:
  1. Always protect `process.on('unhandledRejection')` against transient DB network errors, allowing Mongoose auto-reconnect and watchdog to recover.
  2. Scope `node --watch` to source directories (`--watch-path=...`).
  3. Ensure all background loops check `mongoose.connection.readyState === 1` before querying.
  4. Maintain automatic fallback to `mongodb-memory-server` in development and test environments with automatic retry reconnect watchdog.

