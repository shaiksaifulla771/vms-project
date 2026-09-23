# ERP Gap Analysis & Implementation Plan

Date: 23 Sep 2026 · Baseline: `master` @ `ffe59ca` + branch `fix/audit-bugs-remove-login`
Target: the Project "MASTER PLAN & ARCHITECTURE" (Zoho-style ERP for Inventory, Planning, Manufacturing).

---

## 1. Where the project stands today

| Area | Current state |
|---|---|
| Live database | **MongoDB (Mongoose, ~50 collections)**. Runs without replica set → multi-document transactions are silently disabled ("graceful degradation"). |
| PostgreSQL | Partial. `docs/schema.sql` (48 tables incl. `inventory_lots`, `inventory_transactions`, `plans`, `batch_records`, `batch_actual_input_lots`) and `/api/pg/*` reference routes for materials, vendors, MPNs, locations, warehouses, BOMs only. Prisma schema is an introspection of Supabase (includes the `auth` schema). Nothing operational (inventory, planning, batches) runs on Postgres. |
| Backend | Express, ~40 route files. Large amount of scope outside the spec: visitor management (VMS), email queue, plugins, MCP, AI copilot/chat, contracts, purchasing, QC, workflows. |
| Frontend | React + Vite + Tailwind. Only Masters, MPN, Inventory, Planning/MRP, BOM, Sites, Users, Classifications are routed. Dashboard, Manufacturing, Reports, Purchasing, Quality, Scheduling, Workflows pages exist but are unreachable. |
| Auth | Was Firebase + custom JWT + OTP login. **Now removed** (see §2.3). |

---

## 2. What was fixed in this pass

### 2.1 Blocking errors (backend would not start)
| File | Problem | Fix |
|---|---|---|
| `backend/services/bomRecipeService.js` | Bad merge left duplicate `const { productId, … } = data` (×2) and a duplicated `if (…) {` → `SyntaxError`, server crash on boot. | Removed old lines. |
| `backend/routes/inventoryRoutes.js` | Duplicate `getLotsForMaterial` import without comma → `SyntaxError`. | Fixed. |
| `backend/controllers/batchExecutionController.js` | Duplicate `if (consumeLotStock) {` and duplicate destructured `materialInputs` → `SyntaxError`. | Controller rewritten (see 2.2). |
| `backend/.npmrc` (new) | `npm install` fails with ERESOLVE (`ioredis@6` vs `ioredis-mock` peer). | `legacy-peer-deps=true`. |

### 2.2 Logic / data-integrity bugs
| Bug | Impact | Fix |
|---|---|---|
| Lot transfer debited source with type `'Transfer'`, which the ledger's `switch` treated as a **stock increase** (default branch). | Every inter-WH transfer *created* stock at source instead of removing it. | Uses `TRANSFER_OUT`/`TRANSFER_IN`; unknown types are now rejected; credit failure auto-reverses the debit. |
| `authorize('Admin','Manager',…)` varargs were treated as a single string → `.includes()` did a substring match. | 129 route guards effectively allowed only Admin. | `requireRole(...roles)` accepts varargs or array. |
| `User` pre-save collapsed every role into `Admin/Editor/Viewer`. | Route guards for `Inventory Manager`, `Production`, `Planner`… could never match. | Roles kept as named; added `Manager`, `Operator`; `Editor` keeps legacy "all non-admin actions". |
| Ledger enum missing `Adjustment`, `PRODUCTION_IN`, `Allocation`. | Balance updated but ledger insert failed → stock and audit diverged. | Enum extended; if the ledger insert fails without a real DB transaction the balance change is rolled back. |
| Expired lots could be issued/consumed. | Spec violation. | Blocked centrally in the ledger for issue/consumption types, and in `/inventory/outward`. |
| Batch execution posted finished goods **first**, then consumed materials and only `console.warn`-ed on failures; created the batch record before validation. | Partial inventory updates; FG could be booked with no RM consumption. | Rewritten: validate everything first (lot exists, not expired, enough stock per lot incl. duplicates, variance reasons), then post all-or-nothing with automatic reversal, then save the record. |
| Batch component schema had no `lotNumber` / `warehouseId` / `varianceReason`. | Lot selected in UI was silently dropped → **no traceability**. | Fields added; order also stores `source`, `executedBy`, `planOutputQty`, output variance. |
| Plan "executed" counter was `completedPlans += 1`; summary assumed batch size 1000 when missing. | Target/Executed/Remaining wrong. | `executedQuantity` = Σ actual output; `remainingQuantity` = target − executed; status → PARTIALLY_COMPLETED/COMPLETED. |
| Plan edit used `parseInt`, compared *batch counts* to *quantities*, re-exploded BOM for the full target. | Spec example (10→20 with 1 done) produced wrong requirements. | Target edit recalculates remaining = target − executed and explodes BOM only for remaining; **Admin-only** per spec. |
| BOM explosion used linear `qty/batchSize` scaling; simulation used `ceil` batches. | Two different answers for the same plan. | Both use `ceil(demand / Expected_Output_Qty) × qty_per_batch`. |
| Availability counted expired, reserved and on-hand stock. | Plans showed "Long" for unusable stock. | Uses `available`, excludes expired lots. |
| Hard-coded fallbacks (`'Primary Supplier'`, `'MPN-STD'`, `'Standard Vendor'`, batch size `1000`, fabricated expiry dates). | Fake data shown as real. | Removed from planning summary/simulation. |
| `/inventory/adjust-lot` allowed Warehouse/Inventory roles. | Spec: adjustments are Admin-only. | Admin-only. |
| Frontend crashes (`ReferenceError`): `BomCostBreakdown` (`Button`), `BomDetail` (`Copy`), `MPNMaster` export (`materialFilter`/`vendorFilter`), `MaterialsTab` dead module-level helpers referencing component state. | Pages crash on those actions. | Imports added / dead code removed. |
| Products tab called non-existent `/api/inventory/balance`. | FG stock always 0. | Uses `/api/inventory`. |
| Batch modal had no lot selection and no per-material variance reason; edit mode read the wrong field (`materials` vs `components`). | Every batch consumed "DEFAULT"; edits showed no inputs. | Lot selector (FEFO pre-selected, expired lots hidden) + reason column + client-side checks. |
| Duplicated UI labels from bad merge ("+ + Inward Stock + Inward", etc.). | Cosmetic. | Cleaned. |

### 2.3 Login page removed
- Deleted `Login.jsx`, `ResetPassword.jsx`, unused `ProtectedRoute.jsx`, `config/firebase.js`.
- `AuthContext` now loads the session from `GET /api/auth/me` with no token.
- Backend `protect()` runs in **acting-user mode** when no bearer token is sent (`AUTH_DISABLED`, default ON in development, must be set explicitly in production, OFF in tests): user from `X-User-Id` header, else first active Admin (auto-created on an empty DB).
- Sidebar "Sign Out" replaced with an **"Acting as"** user switcher, so RBAC (Admin / Manager / Operator…) can still be exercised without a login screen.

### 2.4 Verified
- Backend boots; frontend builds; no undefined-reference lint errors.
- API smoke test (live server): inward → outward (expired blocked, over-issue blocked) → transfer (source −30, dest +30, lot/dates preserved) → adjust (Editor 403, Admin OK) → simulate → plan 2000 → failing batch leaves stock untouched → variance gate → batch OK (FG +990, lot traced) → summary 990/1010 → non-admin target edit 403 → Admin target 3000 → remaining 2010 → IP/OP edit posts delta only.
- Backend unit tests: 94/95 pass, same as before the changes (the failure is the concurrency test in `sequence.test.js`, and it fails without these changes too).

---

## 3. Gap analysis vs. the Master Spec

Legend: ✅ meets · 🟡 partial · ❌ missing

| Spec requirement | Status | Gap |
|---|---|---|
| Relational DB (PostgreSQL), FKs, ACID | ❌ | Live system is MongoDB without transactions. |
| Company → Location → WH hierarchy; all data scoped | 🟡 | Sites/Warehouses exist; no Company entity; BOM `siteId/warehouseId` optional; many queries unscoped. |
| Global Location/WH selector filters all views | 🟡 | Selector exists (`SiteContext`/Header); not every page/API honours it. |
| Material Master (ID, MPN, Classification, Name) | 🟡 | Exists with extra fields; classification values inconsistent (`Finished` vs `Finished Goods`). |
| MPN–Vendor mapping | 🟡 | MPN has `vendorId`; one MPN → one vendor only. |
| BOM header (Batch_Size, Expected_Output, UOM, Location, WH, Version, Status) + lines (MPN, qty/batch, UOM, Scrap %) | 🟡 | Fields exist after latest commit; lines keyed by material not MPN; Location/WH not enforced; "active BOM per product+location" not unique. |
| Centralized Inventory unique on MPN+Location+WH+Lot | 🟡 | Unique on `materialId+warehouseId+batchNumber`; lot and batch are two fields. |
| Inventory only via system transactions; negative blocked | ✅ (after fix) | All writes go through `InventoryLedgerService`. |
| Immutable Audit Ledger with New_Balance | 🟡 | `InventoryTransaction` has before/after; no DB-level immutability; parallel `AuditLog` collection. |
| Inward / Outward (FEFO lot pick, block expired) | ✅ (after fix) | |
| Stock Transfer Draft → In-Transit → Completed | 🟡 | `/api/transfers` has the workflow; `/api/inventory/transfer` bypasses it (instant). |
| Stock Adjustment (Admin only, New Physical − System) | 🟡 | `/adjust-lot` fixed; a second approval-based `/adjustments` flow also exists. |
| Planning engine: ceil batches, BOM explosion, availability, 3 summaries | ✅ (after fix) | Two plan-creation paths (wizard/MRP vs manual) still coexist. |
| Dynamic plan edit (remaining recalculation) | ✅ (after fix) | UI should show recalculated summary immediately after edit. |
| Batch execution (3 sections, lot per material, tolerance gate) | ✅ (after fix) | Tolerance is env-configured, no settings UI; Manager override flag exists server-side only. |
| Edit batch IP/OP → delta to inventory | ✅ (after fix) | Lot change on edit not supported. |
| Auto inventory update post-manufacturing, atomic | 🟡 | All-or-nothing via compensation; true atomicity needs Postgres transactions. |
| Reports: Stock Balance, Physical Stock Sheet (printable), Transaction Report, Forward/Backward Traceability | ❌ | Only `/reports/summary` + PDF; Reports page not routed; no traceability endpoint. |
| RBAC: Admin (adjustments, plan target), Manager (variance override) | 🟡 | Enforced for the endpoints above; the role model still has 18 legacy roles. |
| Zoho-style UI (white, grey borders, single blue accent, no gradients/animations) | ❌ | Dark slate sidebar, rose/emerald/amber/indigo accents, gradients, framer-motion, tsparticles, cookie banner, AI copilot. |
| No hard-coding | 🟡 | Seed data from `all_recipes.json`; mock audit rows in Vendor/Material audit modals. |

---

## 4. Implementation plan

Principle: **build the spec'd core on PostgreSQL next to the running Mongo app, switch the UI module by module, then delete what the spec doesn't need.** Each phase ends shippable.

### Phase 0 — Stabilise (done in this pass)
Bug fixes and login removal above.

### Phase 1 — PostgreSQL core schema (1–1.5 weeks)
1. Write a new migration set `backend/db/migrations/` (use node-pg-migrate or Prisma Migrate — drop the introspected Supabase `auth` schema from Prisma):
   - `companies`, `locations(company_id)`, `warehouses(location_id)`
   - `materials(material_id, name, classification CHECK IN ('Raw Material','Finished Good'), uom)`
   - `mpns(mpn PK, material_id FK)`, `mpn_vendors(mpn FK, vendor_id FK)` (many-to-many)
   - `boms(bom_id, product_id FK, location_id, warehouse_id, batch_size, expected_output_qty, output_uom, version, status)` + partial unique index: one `Active` BOM per product+location
   - `bom_lines(bom_id, mpn FK, qty_per_batch, uom, scrap_pct)`
   - `inventory(inventory_id, mpn, location_id, warehouse_id, lot_no, qty CHECK (qty >= 0), uom, mfg_date, expiry_date, UNIQUE(mpn, location_id, warehouse_id, lot_no))`
   - `audit_ledger(txn_id, ts, user_id, txn_type, mpn, lot_no, qty_change, location_id, warehouse_id, reference_id, reason, new_balance)` + trigger that rejects UPDATE/DELETE
   - `plans`, `batches`, `batch_inputs` exactly as in spec §2D, plus `settings(key, value)` for variance tolerance
   - `users(id, name, role CHECK IN ('Admin','Manager','Operator','Viewer'))`
2. Reuse `docs/schema.sql` where it already matches (`inventory_lots`, `batch_actual_input_lots`), rename to spec names.
3. Seed script from `backend/config/all_recipes.json` into Postgres.

### Phase 2 — Inventory service on Postgres (1 week)
1. `inventoryService.post(txns[], ctx)`: one `BEGIN … COMMIT`, `SELECT … FOR UPDATE` on each inventory row, upsert by the 4-key, write `audit_ledger` with `new_balance`, expiry and negative checks.
2. Endpoints under `/api/v2/inventory`: `inward`, `outward` (returns FEFO lots), `adjustments` (Admin), `transfers` (Draft → In-Transit → Completed; stock moves only on Completed; two ledger rows).
3. Remove the instant `/api/inventory/transfer` path.

### Phase 3 — Masters & BOM on Postgres (1 week)
Materials, MPN-vendor mapping, BOM header/lines with versioning (new version on edit, old → Obsolete), all scoped to Location/WH. Promote the existing `/api/pg/*` routes to `/api/v2/*`.

### Phase 4 — Planning engine (1 week)
1. `POST /api/v2/plans/simulate` and `POST /api/v2/plans` (Product, Demand, Location).
2. `PATCH /api/v2/plans/:id` target edit (Admin) → recompute Remaining, BOM explosion for remaining, availability → returns the 3 summaries in one response.
3. Material summary with Vendor from `mpn_vendors`, Short/Long.

### Phase 5 — Manufacturing execution (1 week)
1. `POST /api/v2/batches` in one DB transaction: validate lots → consume RM lots → create FG lot → ledger rows (reference = Batch_ID) → update plan executed/remaining.
2. `PATCH /api/v2/batches/:id` → delta postings in one transaction (supports lot change).
3. Variance tolerance from `settings`; over-tolerance needs reason, or a Manager override flag (logged).

### Phase 6 — Reports & traceability (0.5–1 week)
Stock Balance Sheet (grouped by Location/WH), printable Physical Stock Sheet (blank Physical column, print CSS), Transaction Report (filters: date, location, MPN, type) with CSV export, Traceability (FG lot → batch → RM lots, and reverse) from `batch_inputs`.

### Phase 7 — Zoho-style UI rebuild (1.5 weeks, in parallel with 3–6)
1. Design tokens: white background, `#1F2937` text, `#E5E7EB` borders, single accent `#2563EB`; remove gradients, framer-motion, tsparticles, cookie banner, AI copilot from the shell.
2. Shell: light left nav (Masters · Inventory · Planning · Manufacturing · Reports · Settings), top bar with global Location/WH selector + acting-user switcher.
3. One reusable `DataGrid` (sort, filter, column chooser, CSV) and `FormPanel`; rebuild screens: Materials, MPN/Vendors, BOM, Inventory (Stock, Inward, Outward, Transfers, Adjustments), Planning (3 summaries), Batch Entry (3 sections), Reports, Settings (variance tolerance, users/roles).
4. Every screen reads the global Location/WH and sends it to the API.

### Phase 8 — Cut-over & cleanup (0.5 week)
1. Data migration Mongo → Postgres (masters, BOMs, opening stock as `Opening` ledger rows).
2. Delete the modules the spec doesn't ask for (VMS visitors/appointments, email queue, plugins, MCP, chat/AI, contracts, purchasing, QC, workflows, Firebase/Supabase auth, BullMQ/Redis) or move them to an archive branch.
3. Remove Mongoose, `mongodb-memory-server`, `express-mongo-sanitize`.

### Phase 9 — Tests & CI (throughout)
Integration tests against a real Postgres (testcontainers or CI service): negative-stock race (parallel issues), transfer lifecycle, batch atomicity (forced failure mid-batch → no partial rows), plan edit 10→20 with 1 executed → remaining 19, traceability round-trip, RBAC matrix.

---

## 5. Decisions needed from you
1. **Migration strategy**: rebuild on Postgres (recommended, matches the spec) *or* keep MongoDB with a replica set for transactions.
2. **Scope cut**: confirm the non-spec modules (VMS visitors, purchasing, QC, workflows, AI copilot) can be removed.
3. **Role model**: collapse to Admin / Manager / Operator / Viewer?
4. **Scrap allowance**: include BOM `Scrap_Allowance_%` in required quantity (current behaviour) or use the spec formula exactly (`qty_per_batch × batches`)?
5. **Production auth**: no-login mode is fine for a single-site internal deployment; for anything network-exposed, re-enable auth with `AUTH_DISABLED=false` (the old login code is in git history).
