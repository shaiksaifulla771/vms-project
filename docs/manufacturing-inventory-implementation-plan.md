# Manufacturing and Inventory Flow Implementation Plan

## 1. Scope

Implement the handwritten flow for a location-aware manufacturing system:

`Master Data -> MPN/Vendor Mapping -> BOM -> Inventory Entry -> Inventory Storage -> Planning/MRP -> Batch Execution -> QC/Disposition -> Inventory Update`

The screenshots imply two user-facing outputs:

- A plan summary by product, batch count, target output, executed quantity, and remaining quantity.
- A batch execution record with source plan, lot/batch number, manufacturing and expiry dates, planned versus actual output, material consumption variance, lot traceability, and a reason when variance exceeds tolerance.

The existing code already contains most domain modules. The implementation should consolidate contracts and enforce cross-domain invariants rather than create duplicate modules.

## 2. Rules and Skill Constraints

- Database writes precede domain events; audit logs are append-only.
- Cross-table writes use one database transaction. Quantity and value change together.
- Stock cannot go negative and all stock writes carry site and warehouse context.
- Inventory transactions are immutable and go through `inventoryLedgerService.js`.
- BOM explosion must prevent cycles, respect revision/effective dates, scrap/yield, substitutions, UOM conversion, and batch scaling.
- MRP must net on-hand, reserved, on-order, and incoming stock; offset lead times; expose shortages; and respect capacity.
- Production uses explicit legal transitions and maker-checker separation for overrides.
- QC supports inspection, tolerance, quarantine, disposition, rework/scrap, and CAPA outcomes.
- All operational writes enforce JWT, RBAC, and Global/Site/Warehouse scope.
- Location deactivation is soft, impact-previewed, audited, and blocked when active dependencies remain.
- External and asynchronous effects are idempotent, retryable, observable, and cannot double-post stock.
- Schema changes are additive-first, reversible, and separately approved before destructive cleanup.

## 3. Existing Implementation Surface

### Backend

- Master data: `backend/models/Material.js`, `MPN.js`, `Vendor.js`, and related services/controllers.
- MPN/vendor mapping: `backend/services/mpnService.js`, `vendorService.js`.
- BOM: `backend/models/BOM.js`, `backend/services/bomExplosionService.js`, `bomCostService.js`, `bomRecipeService.js`.
- Inventory: `backend/models/InventoryItem.js`, `InventoryTransaction.js`, `backend/services/inventoryLedgerService.js`.
- Sites and warehouses: `backend/models/Site.js`, `Warehouse.js`, `WarehouseMaterial.js`.
- Planning: `backend/models/MRPRun.js`, `PlanningRequirement.js`, `backend/services/mrpEngineService.js`, `productionPlanningEngine.js`.
- Production: `backend/models/ProductionPlan.js`, `ProductionOrder.js`, `ProductionPlanInstance.js`, production controllers/routes.
- QC: `backend/models/QualityRecord.js`, `backend/controllers/qcController.js`.
- Governance: `AuditLog.js`, `auditService.js`, `eventBus.js`, `accessControlService.js`, `checkScope.js`, and `locationEnforcement.js`.

### Frontend

- Master catalogs: `frontend/src/pages/MPNMaster.jsx` and the existing Materials/Vendors tabs.
- BOM: `frontend/src/pages/bom/BOMRoutes.jsx`.
- Planning: `frontend/src/pages/MRP.jsx`.
- Production and QC: `frontend/src/pages/production` and `frontend/src/pages/Quality.jsx`.
- Governance: `NetworkAndSites.jsx`, `UsersAndAccessScope.jsx`, and `AuditAndActivity.jsx`.

## 4. Delivery Slices

### Slice A - Contracts and invariants

1. Choose one canonical access-approval API and deprecate duplicate approval routes through a compatibility layer.
2. Define shared DTOs/enums for material, MPN, vendor, site, warehouse, lot, UOM, plan, work order, batch, QC result, disposition, and transaction type.
3. Centralize legal state transitions for plans, production orders, batches, transfers, QC, and deactivation.
4. Add service-level invariant checks: active location, scope, available quantity, lot expiry, UOM, revision, and idempotency key.

Acceptance: invalid transitions, missing warehouse/site, inactive locations, negative stock, duplicate idempotency keys, and expired lots are rejected with stable error responses.

### Slice B - Master data and BOM

1. Preserve existing compact master-data CRUD UX and 50-row pagination.
2. Strengthen MPN-to-material/vendor/location mapping with uniqueness and effective dates.
3. Add BOM revision locking, circular-reference detection, UOM conversion, approved substitutions, scrap/yield, and batch scaling.
4. Expose a versioned explosion result that includes required quantity, gross quantity, scrap, source revision, MPN, vendor, and location.
5. Ensure BOM costing and planning use the same approved revision and MPN pricing basis.

Acceptance: the same BOM revision produces deterministic requirements and cost; cycles and unapproved substitutions cannot be saved or planned.

### Slice C - Inventory and location controls

1. Route receipts, consumption, production receipts, transfers, adjustments, quarantine, rework, and scrap through the ledger service.
2. Add lot/batch allocation with FIFO and expiry-aware selection; retain lot, manufacturing date, expiry date, site, warehouse, and bin/location where applicable.
3. Make `available = onHand - reserved` the authoritative availability calculation and define one canonical transaction vocabulary.
4. Add reservation and release operations with optimistic concurrency and idempotency.
5. Apply scope and active-location middleware consistently to inventory, warehouse, transfer, production, procurement, and QC writes.
6. Add reconciliation reporting between balance snapshots and immutable ledger totals.

Acceptance: concurrent consumption cannot oversell stock; every transaction is traceable to actor, reason, source document, location, and lot.

### Slice D - Planning and plan summary

1. Build the plan input from demand, target output, approved BOM, current inventory, reservations, open supply, lead times, MOQ, and capacity.
2. Calculate net requirements and backwards dates; emit material shortages and production constraints.
3. Support system-driven planning as the default. Manual overrides require a reason, permission, and audit event.
4. Produce the screenshot-style plan summary: product, number of batches, target output, executed output, and remaining output.
5. Link every planned batch to its source plan and BOM revision.

Acceptance: a plan is blocked or explicitly overridden when shortages/capacity fail; rerunning the same input is idempotent and explainable.

### Slice E - Batch execution and traceability

1. Add or harden batch execution states: Draft, Scheduled, Released, In Progress, Completed, Cancelled, and Held.
2. On release, reserve required materials by lot/location without posting consumption.
3. On execution, record actual material quantities, operator, timestamps, source lots, output lot number, manufacturing date, expiry date, and actual output.
4. Calculate absolute and percentage variance for each material and for output.
5. Require a reason and authorized approval when variance exceeds configured tolerance; do not silently accept the handwritten variance cases.
6. Post consumption and finished-goods receipt atomically through the ledger service.

Acceptance: a batch cannot complete without required inputs or an audited override; every finished lot can be traced back to consumed material lots and the source plan.

### Slice F - QC, quarantine, and disposition

1. Expand QC beyond a single status/notes record to structured samples, specifications, measurements, defects, attachments, and inspector.
2. Support Incoming, In-Process, and Finished Goods checkpoints.
3. Route failed or held material to quarantine and prevent it from planning/allocation until disposition.
4. Model Pass, Fail, Rework, Scrap, and Release dispositions with legal transitions, authorization, and audit.
5. Add CAPA linkage and vendor-quality impact where required.
6. Ensure QC completion uses the ledger service with resolved site/warehouse context.

Acceptance: failed stock cannot be consumed or shipped; release, rework, and scrap each create the correct audited ledger effect.

### Slice G - Governance and operational UX

1. Require role, site, warehouse, and reason fields where the workflow requires them.
2. Add impact preview before site/warehouse/user deactivation, including open stock, reservations, transfers, production, QC holds, and assignments.
3. Preserve soft deactivation and last-admin protection.
4. Make approval, deactivation, transfer, unlink, and override actions visible in audit history.
5. Keep high-volume master catalogs in modals/drawers; use dedicated workflow screens for planning, batch execution, and QC.

Acceptance: users only see and mutate permitted scope; every sensitive action has actor, reason, before/after state, correlation ID, and timestamp.

## 5. Data and Migration Strategy

Use additive migrations only:

1. Add missing fields/collections for revisions, lots, UOM conversions, batch execution, variance approvals, QC measurements/dispositions, quarantine, CAPA, and idempotency keys.
2. Backfill in resumable batches with site/warehouse resolution; stop and report unresolved records.
3. Add indexes after backfill validation: scope/location, material+lot, source document+idempotency key, active revision, and state/date queries.
4. Introduce dual-read/dual-write only where an existing contract must remain compatible.
5. Reconcile ledger totals before enabling enforcement.
6. Remove deprecated fields/routes only in a separately approved migration.

Do not create orphan `InventoryItem` or `InventoryTransaction` records from master-data operations. Every inventory record must have explicit warehouse and site context.

## 6. API and Event Boundaries

Canonical write services should expose operations equivalent to:

- `POST /api/materials`, `/api/mpns`, `/api/vendors`, `/api/boms`
- `POST /api/inventory/receipts`, `/consume`, `/transfer`, `/adjust`, `/reserve`, `/release`
- `POST /api/mrp/runs` and `GET /api/mrp/runs/:id/summary`
- `POST /api/production/plans`, `/orders`, `/batches/:id/release`, `/start`, `/complete`
- `POST /api/qc/inspections`, `/dispositions`, `/capa`
- `GET /api/governance/impact-preview/:entity/:id`

After the database transaction commits, publish typed events through `eventBus.js`, such as `InventoryPosted`, `StockReserved`, `PlanCreated`, `BatchStarted`, `BatchCompleted`, `QCFailed`, `StockQuarantined`, and `LocationDeactivated`. Event handlers must be idempotent and must not be the source of truth for the primary write.

## 7. Validation and Test Plan

### Unit tests

- BOM recursion, revision dates, scrap/yield, substitutions, UOM, and batch scaling.
- Net requirements, lead-time offsetting, MOQ, capacity, and shortage classification.
- Inventory availability, FIFO/expiry allocation, variance math, and state transitions.
- QC tolerance, quarantine, disposition, and CAPA rules.
- RBAC scope and deactivation impact rules.

### Integration tests

- PO/receipt -> lot inventory -> planning availability.
- Plan -> reservation -> batch consumption -> finished-goods receipt.
- Batch -> QC fail -> quarantine -> rework/release/scrap.
- Location deactivation with blocking dependencies.
- Duplicate retry of every ledger-posting command.

### UI/E2E tests

- Create master data and approved BOM.
- Run planning and inspect plan/material summaries.
- Release and execute a batch with lot traceability.
- Submit an over-tolerance variance and approve/reject it.
- Complete QC and verify stock disposition.
- Verify role/site/warehouse access and audit history.

Run the existing backend unit, integration, E2E, and full suites, plus frontend tests/build. Use the repository's `run_ci.ps1` after focused checks pass.

## 8. Rollout and Observability

1. Feature-flag enforcement by domain and site.
2. Run read-only reconciliation before enabling ledger enforcement.
3. Enable master data/BOM validation first, then inventory, planning, production, and QC.
4. Monitor correlation IDs, transaction failures, reservation conflicts, negative-stock blocks, event retries, dead letters, and reconciliation deltas.
5. Provide a rollback switch for enforcement flags and preserve all audit/ledger records.

## 9. Required Decisions Before Coding

1. Which approval API is canonical: `/api/access/approvals/*` or `/api/users/:id/approve`?
2. Are specialized roles persisted distinctly, or intentionally normalized?
3. Can planners override shortages/capacity, and which role can approve?
4. What are the authoritative UOM conversions, BOM revision policy, yield tolerances, and expiry rules?
5. What QC standards, sampling rules, quarantine warehouse, and CAPA states apply?
6. Can users have multiple warehouse assignments and multiple sites?
7. What is the exact immediate release: governance, inventory/BOM, planning summary, or complete batch execution?

## 10. Recommended First Milestone

Start with Slice A plus the minimum of Slices B-D:

- canonical contracts and transition services;
- approved BOM explosion with revision/UOM/scrap controls;
- ledger-backed, lot-aware inventory with warehouse/site enforcement;
- deterministic MRP plan and screenshot-style summary;
- focused integration tests for plan -> reservation -> batch input availability.

This creates a reliable foundation for batch execution and QC without introducing a second inventory or planning authority.
