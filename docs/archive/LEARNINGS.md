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

## 2026-08-28 — Master Catalog View/Edit UI Modal & Drawer Preservation [frontend/masters-ux]
- What was tried: Converting Master catalogs (Materials, Vendors, MPNs) into full-page dedicated subview routes mimicking complex multi-tab BOM screens.
- What broke: Disrupted standard ERP master catalog productivity and ergonomics; full-page switches for simple catalog records felt clunky and unpolished.
- Root cause: Master catalogs (Materials, MPNs, Vendors) are high-velocity reference entities best managed through sleek, in-place modals and slide-over side drawers rather than full-page view/edit route transitions.
- Rule going forward: Keep Master Catalogs (MaterialsTab, VendorsTab, MPNMaster) using clean, in-place modals/drawers. Do not convert simple CRUD master tables to full-page nested views unless explicitly requested.

## 2026-08-28 — Master Data Excel Spreadsheet Layout & 50-Record Default Pagination [frontend/masters-excel-density]
- What was tried: Nested floating card wrappers with separated toolbars, tables, and pagination bars created excessive gaps, outer paddings, and inconsistent default page limits across modules.
- What broke: Disjointed card boxes created unwanted rem/px gaps between toolbar, data grid, and footer, and default page limits were inconsistent (10, 15, 50).
- Root cause: Multiple floating `<Card>` containers with outer margins and different `useState(15)` / `useState(10)` defaults.
- Rule going forward:
  1. Default pagination limit MUST be **50 records per page** across all Master Data & catalog views (`MaterialsTab.jsx`, `VendorsTab.jsx`, `MPNMaster.jsx`, and `BomList.jsx`), with a 10/25/50/100 page size dropdown.
  2. Implement an authentic **Excel Spreadsheet layout** for master data grids:
     - Enclose entire sheet in a single contiguous border container (`border border-slate-300 rounded-b-md overflow-hidden bg-white shadow-2xs`).
     - Flush top ribbon toolbar (`bg-slate-50 border-b border-slate-300 p-1 px-2`).
     - Continuous sharp cell gridlines (`border-collapse`, `border-r border-b border-slate-200`).
     - High-density Excel cell sizing (`h-6.5`, `!py-0.5 !px-1.5`, `text-[11px]`).
     - Compact action column (`w-[64px]`, `gap-0.5`).
     - Flush Excel status bar at the bottom (`bg-slate-100/90 border-t border-slate-300 px-2.5 py-1 text-[11px]`).

## 2026-08-28 — Python MRP Microservice, Redis BullMQ & MongoDB Deep Resilience [backend/resilience-audit]
- What was tried: Cross-service dispatch from Node.js MRP planning gateway to the Python FastAPI microservice, BullMQ workers, and MongoDB connection listeners.
- What broke:
  1. Python `MRPSolver.solve` expected 3 positional parameters (`target_quantity`, `required_date`, `components`), but `main.py` passed `req_dict` (single dict parameter), causing `TypeError: MRPSolver.solve() missing 2 required positional arguments`.
  2. Python `DemandForecaster` lacked the `forecast(req_dict)` dispatch classmethod, causing `AttributeError: type object 'DemandForecaster' has no attribute 'forecast'`.
  3. `comp_req_date` variable was used at line 168 in `mrp_solver.py` without being assigned, causing a potential `NameError`.
  4. Multiple background instances of `npm run dev` from previous sessions were holding port 5000 and triggering unhandled port collision loops on Windows.
- Root cause:
  1. Parameter signature mismatch between FastAPI request handler and engine solver classes.
  2. Unassigned variable name in backwards scheduling output assignment.
  3. Ghost Node processes running in background tasks without automated pre-dev port freeing.
- Rule going forward:
  1. Python microservice solver methods (`MRPSolver.solve`, `DemandForecaster.forecast`) must be polymorphic — accepting both direct keyword arguments and JSON dictionary/Pydantic request payloads.
  2. All FastAPI response envelopes must match the contract expected by Node.js clients (`{ success: true, product_id, optimal_schedule: [...] }`).
  3. Keep BullMQ connections configured with `maxRetriesPerRequest: null` and ensure unhandled error listeners are attached to all queues and workers.
  4. Always run `predev` to clear port 5000 on Windows prior to starting `node --watch`.

## 2026-08-28 — Master Data Table Layout Preferences & Reversion [frontend/masters-styling]
- User Decision: Reverted the experimental MPN alignment (which collapsed vendor columns and adjusted description widths) back to the established compact table layout for Materials and Vendors tabs.
- Rule going forward:
  1. Maintain the compact table layout on [`MaterialsTab.jsx`](file:///c:/Users/My%20Pc/.gemini/antigravity-ide/scratch/vms-project/frontend/src/pages/masters/MaterialsTab.jsx) and [`VendorsTab.jsx`](file:///c:/Users/My%20Pc/.gemini/antigravity-ide/scratch/vms-project/frontend/src/pages/masters/VendorsTab.jsx) with all standard schema columns (including Code, Sub-Category, FSSAI Validity, GSTIN Code on Vendors) visible.
  2. Keep default pagination at 50 records per page (`pageSize = 50`) using `paginatedMaterials` / `paginatedVendors` with `currentPage` state.

