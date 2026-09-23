# VMS & MES Master System Specification
## Single Source of Truth (SSOT), Functional Blueprint & Enforcement Contract

> **MANDATORY SYSTEM DIRECTIVE & STOP-THE-LINE RULE:**
> This document is the authoritative, binding specification for the Vendor Management System (VMS) and Manufacturing Execution System (MES). 
> Whenever any code, migration, or refactoring is initiated on this project, the implementing agent or engineer **MUST verify every action against this document**.
> **If any planned or written code breaks an existing feature, omits a documented constraint, deletes existing functionality, or violates an invariant herein, EXECUTION MUST STOP IMMEDIATELY THEN AND THERE. The codebase must be realigned to strictly adhere to this specification before proceeding.**

---

# 1. Tech Stack & Architectural Baseline

### 1.1 Complete Technology Stack
* **Frontend Tier**:
  - Framework: React 18 (Vite, React Router v6, Tailwind CSS).
  - Component Architecture: Clean, modular UI components (`Card`, `Table`, `Drawer`, `Dialog`, `SearchableSelect`, `Badge`, `Button`, `Input`).
  - Data Grid Standard: High-density Excel-style layout (`border-collapse`, sharp cell gridlines, `h-6.5` compact row height, flush toolbar and footer).
  - Default Pagination: **50 records per page** across all master tables with 10/25/50/100 selector.
  - Streaming / Real-Time: Server-Sent Events (`useSSE.js`), Socket.io client (`useSocket.js`), and live polling failover.
  - State / Auth: `AuthContext.jsx` (session tokens, user profile, role rank) and `SiteContext.jsx` (active operational location).
* **API Gateway & Middleware Tier**:
  - Server: Node.js (v20+), Express.js (Port `5000`).
  - Auth Dual Engine:
    1. *Legacy/Live*: Firebase Admin SDK + custom JWT/bcrypt tokens on `/api/*`.
    2. *Target/Postgres*: Supabase Auth (Asymmetric JWKS verification via `jwks-rsa`, RS256/ES256, HS256 fallback) on `/api/pg/*`.
  - Transaction Context Manager: `req.withTransaction(fn)` via `supabaseAuthMiddleware.js`, running per-operation PostgreSQL transactions under `SET LOCAL ROLE authenticated` with `request.jwt.claims` set.
  - Security & Guard Middleware: Role check ranks (`Viewer` = 0, `Editor` = 1, `Admin` = 2), per-user rate limiters, active location scope enforcer (`enforceActiveLocation`).
  - Error Translation Engine: Database-to-HTTP mapper in `backend/middleware/errorHandler.js` (Postgres RLS $\rightarrow$ 403, Prisma P2002 $\rightarrow$ 409, Prisma P2025 $\rightarrow$ 404, CHECK 23514 $\rightarrow$ 400).
* **Database & Persistence Tier**:
  - Target Relational DB: **Supabase PostgreSQL 15+** (`hqpkgutythloohankart`), 48 business tables under `public`, schema isolation for internal triggers (`internal`), and extensions schema (`extensions.btree_gist`).
  - Database Security: Row-Level Security (RLS) enabled on every business table, evaluating `public.get_auth_role()` and `auth.uid()`.
  - Typed Client: Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`, `backend/prisma/schema.prisma` introspected from the live DB).
  - Source of Truth: Numbered SQL migrations in `docs/migrations/0001` through `0014` and `docs/schema.sql`. (Prisma Migrate is disabled; raw SQL is the schema authority).
  - Legacy Fallback: MongoDB / Mongoose 8 (`backend/models/`), with automatic in-memory fallback (`mongodb-memory-server`) for local development without Atlas.
* **Background Jobs & Message Queues**:
  - Queue Engine: BullMQ with Redis (`ioredis`, `maxRetriesPerRequest: null`), featuring graceful in-memory mock fallback when Redis is absent.
  - Asynchronous Handlers: Outbound email queue, shortage alert notifications, automated inventory reconciliation.
* **AI & MCP Copilot**:
  - LLM Services: Google Generative AI (`@google/generative-ai`) and Anthropic MCP servers.
  - Scope: Forensic audit analysis, natural language inventory queries, auto-drafting RFQs.

---

# 2. Core Invariants & "Never Break" Preservation Contract

### 2.1 Non-Negotiable Invariants (Data & Financial Integrity)
1. **Zero Negative Stock**: `quantity_on_hand >= 0` is strictly enforced by PostgreSQL database CHECK constraints. Stock may never drop below zero under any condition.
2. **Double-Entry Immutable Stock Ledger**: Inventory balances are never updated blindly. Every physical delta MUST write an immutable record to `inventory_transactions` (`RECEIPT`, `ISSUE`, `ADJUSTMENT`, `TRANSFER`, `SCRAP`).
3. **Atomic Multi-Table Transactions**: Any operation affecting inventory balances, monetary values, batch consumptions, or approvals must execute inside a single DB transaction. Quantity and monetary value move together.
4. **Append-Only Audit Trail**: Updates and deletions on `audit_log` are strictly blocked by database rules. Every state transition, price alteration, and admin override must write an audit record with `actor_id`, `action`, `table_name`, `record_id`, and `diff (old vs new)`.
5. **No Overlapping Vendor Prices**: PostgreSQL GiST exclusion constraint (`EXCLUDE USING gist (material_vendor_id WITH =, effective_range WITH &&)`) mathematically guarantees that a vendor part cannot have duplicate active prices on any given date.
6. **Single Default Warehouse Rule**: Every location must have at least one warehouse. Each location has exactly one default warehouse (`is_default = true`). Setting a new warehouse as default atomically resets all other warehouses at that site.
7. **Single Active BOM Version**: A product can have only one active approved BOM revision at any given time, enforced by partial unique index `uq_boms_one_active_per_product`.
8. **5.0% Variance Tolerance Gate**: During batch execution, if actual material consumption deviates from the planned BOM input by more than $\pm 5.0\%$, the operator is strictly blocked from completing the batch until an audited justification reason is provided.

### 2.2 Existing Features That Must Never Be Deleted or Broken
* **Material Catalog (`MaterialsTab.jsx`)**:
  - High-density Excel layout with default **50 rows/page** pagination.
  - Bulk Excel upload grid (`BulkVendorUploadGrid`) and template download (`XLSX`).
  - In-place slide-over drawer and quick edit modals.
  - Full attribute set: Code, Name, Category, Sub-category, UOM, HSN, Safety Stock, Reorder Point, MOQ, Lead Time Days, Hazardous flag, Storage Temp, FSSAI validity.
* **Vendor Catalog (`VendorsTab.jsx`)**:
  - Full lifecycle states (`DRAFT` $\rightarrow$ `APPROVED` $\rightarrow$ `ACTIVE` $\rightarrow$ `SUSPENDED` $\rightarrow$ `BLACKLISTED`).
  - GSTIN validation, FSSAI number and validity tracking, MSME classification, PAN, Bank Details.
  - Multiple Contact Persons directory with primary contact flag.
  - `VendorAuditModal.jsx` and `VendorDeletedHistoryModal.jsx` preservation.
* **MPN Master (`MPNMaster.jsx`)**:
  - Mapping between internal Material codes and Vendor Part Numbers.
  - Effective date windows, currency, packaging type, and MOQ.
  - Price update timestamping (`priceUpdatedAt`) for BOM drift detection.
* **BOM & Recipe Creator (`BomRecipeEditor.jsx`, `BomList.jsx`, `BomDetail.jsx`)**:
  - Multi-level ingredient tree and subassembly nesting.
  - Planned loss/scrap percentage per line item (`gross_qty = net_qty / (1 - lossPercent)`).
  - Batch size vs output yield scaling.
  - Additional cost layers: Packaging, Processing, and Overhead costs.
  - Dynamic Batch Scaling simulator (scaling recipes from base batch to production target).
  - Live cost calculation and `PriceDriftBanner` alerting operators when ingredient market prices shift.

---

# 3. Exhaustive Module Directory & Functional Specifications

---

## Module 1: Master Data Management (Materials & Products)
* **Frontend Files**: [`frontend/src/pages/masters/MaterialsTab.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/masters/MaterialsTab.jsx), [`frontend/src/pages/ClassificationsPage.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/ClassificationsPage.jsx).
* **Database Tables**: `public.materials`, `public.products`.
* **API Routes**:
  - `GET /api/pg/materials` (Query: `classification`, `search`, `includeDeleted`, `page`, `limit`)
  - `GET /api/pg/materials/:id`
  - `POST /api/pg/materials` (Role: `admin`)
  - `PUT /api/pg/materials/:id` (Role: `admin`)
  - `DELETE /api/pg/materials/:id` (Role: `admin` — soft delete via `deleted_at`)
  - `POST /api/pg/materials/batch` (Bulk insertion and upsert)
* **Functional Logic & UI Behavior**:
  - Auto-increments sequence counters (e.g. `M1001`, `M1002`).
  - Validates classification enums: `RAW_MATERIAL`, `PACKAGING`, `EMULSIFIER`, `CONSUMABLE`, `FINISHED_GOOD`.
  - Reorder point calculation: Alerts MRP when stock falls below `safety_stock + (daily_run_rate * lead_time_days)`.
  - Soft-delete preservation: Deleting a material sets `deleted_at = NOW()` and `deleted_by = auth.uid()`. Materials with active BOM links or positive inventory cannot be deleted.

---

## Module 2: Vendor Lifecycle, Masters & Performance (VMS)
* **Frontend Files**: [`frontend/src/pages/masters/VendorsTab.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/masters/VendorsTab.jsx), [`frontend/src/pages/Performance.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Performance.jsx), [`frontend/src/pages/Contracts.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Contracts.jsx).
* **Database Tables**: `public.vendors`, `public.vendor_masters`, `public.vendor_master_contacts`, `public.vendor_contracts`, `public.vendor_performance_ratings`.
* **API Routes**:
  - `GET /api/pg/vendors`, `POST /api/pg/vendors`, `PUT /api/pg/vendors/:id`, `DELETE /api/pg/vendors/:id`
  - `GET /api/pg/vendor-masters`, `POST /api/pg/vendor-masters`, `PUT /api/pg/vendor-masters/:id`
  - `GET /api/pg/vendor-contracts`, `POST /api/pg/vendor-contracts`, `PUT /api/pg/vendor-contracts/:id`
  - `GET /api/pg/vendor-performance`, `POST /api/pg/vendor-performance`
* **Functional Logic & UI Behavior**:
  - Enforces vendor state transitions: `DRAFT` $\rightarrow$ `APPROVED` $\rightarrow$ `ACTIVE` $\rightarrow$ `SUSPENDED` $\rightarrow$ `BLACKLISTED`.
  - Blocks PO generation or active BOM association for any vendor not in `ACTIVE` state.
  - Validates GSTIN format (15 characters) and FSSAI 14-digit registration numbers.
  - Evaluates vendor performance across 3 pillars: On-Time Delivery % (OTIF), Quality Acceptance % (PPM defects), and Pricing Adherence.

---

## Module 3: MPN (Material-Vendor Mapping) & Effective Pricing
* **Frontend Files**: [`frontend/src/pages/masters/MPNMaster.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/masters/MPNMaster.jsx).
* **Database Tables**: `public.material_vendors`, `public.vendor_prices`.
* **API Routes**:
  - `GET /api/pg/mpns` (Query: `material_id`, `vendor_id`, `is_active`)
  - `GET /api/pg/mpns/:id`
  - `POST /api/pg/mpns` (Role: `admin`)
  - `PUT /api/pg/mpns/:id` (Role: `admin`)
  - `DELETE /api/pg/mpns/:id` (Role: `admin`)
  - `GET /api/pg/mpns/:id/prices`, `POST /api/pg/mpns/:id/prices`
* **Functional Logic & UI Behavior**:
  - Links generic material codes (e.g. `Cocoa Mass`) to vendor-specific part numbers (e.g. `Barry Callebaut - CM-1001`).
  - Uses PostgreSQL GiST date exclusion to ensure no overlapping price intervals for a single MPN.
  - Price sources: `CONTRACT`, `QUOTE`, `SPOT`, `PO_HISTORY`.
  - When a price is modified, `priceUpdatedAt` is updated, triggering price drift recalculations on all active BOMs using that MPN.

---

## Module 4: Engineering, BOM & Recipe Creator
* **Frontend Files**: [`frontend/src/features/bom/BomRecipeEditor.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/features/bom/BomRecipeEditor.jsx), [`frontend/src/pages/bom/BomList.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/bom/BomList.jsx), [`frontend/src/pages/bom/BomDetail.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/bom/BomDetail.jsx), [`frontend/src/pages/bom/BomScale.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/bom/BomScale.jsx).
* **Database Tables**: `public.boms`, `public.bom_items`.
* **API Routes**:
  - `GET /api/pg/boms` (Query: `product_id`, `includeDeleted`)
  - `GET /api/pg/boms/:id` (Includes line items, component materials, and MPN details)
  - `POST /api/pg/boms` (Role: `admin`)
  - `PUT /api/pg/boms/:id` (Role: `admin`)
  - `DELETE /api/pg/boms/:id` (Role: `admin` — soft delete)
  - `POST /api/pg/boms/:id/items`, `PUT /api/pg/boms/:id/items/:itemId`, `DELETE /api/pg/boms/:id/items/:itemId`
  - `POST /api/bom/calculate-cost`, `POST /api/bom/scale`
* **Functional Logic & UI Behavior**:
  - Header attributes: `productId`, `version`, `batchSize`, `batchUOM`, `locationId` / `warehouseId` (Location-aware BOM per Sheet 4), `packagingCost`, `processingCost`, `overheadCost`, `status`.
  - Line items: `materialId`, `mpnId`, `quantity`, `lossPercentage` (scrap factor), `position`.
  - Yield & Scrap Formula: $\text{Gross Quantity Required} = \frac{\text{Net Quantity}}{1 - (\text{lossPercentage} / 100)}$.
  - Cycle detection: Explodes subassemblies recursively; halts and returns `400 BadRequest` if circular references are detected.
  - Cost Rollup: $\text{Unit Cost} = \sum (\text{Component Gross Qty} \times \text{Active MPN Price}) + \text{Packaging} + \text{Processing} + \text{Overhead}$.
  - `PriceDriftBanner`: Displays on `BomDetail` and `BomRecipeEditor` when current MPN price deviates from `priceAtLastSave`.

---

## Module 5: Facilities, Locations & Multi-Warehouse Hierarchy
* **Frontend Files**: [`frontend/src/pages/admin/NetworkAndSites.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/admin/NetworkAndSites.jsx), [`frontend/src/pages/Sites.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Sites.jsx), [`frontend/src/pages/Warehouse.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Warehouse.jsx).
* **Database Tables**: `public.locations`, `public.warehouses`.
* **API Routes**:
  - `GET /api/pg/locations`, `POST /api/pg/locations`, `PUT /api/pg/locations/:id`, `DELETE /api/pg/locations/:id`
  - `GET /api/pg/warehouses` (Query: `location_id`), `POST /api/pg/warehouses`, `PUT /api/pg/warehouses/:id`, `DELETE /api/pg/warehouses/:id`
* **Functional Logic & UI Behavior**:
  - Enforces Sheet 1/4 Rule: **1 Location — 1 WH minimum Default**.
  - Database Trigger: `trg_locations_after_insert` automatically calls `internal.trg_auto_create_default_warehouse()` creating `WH-01 (MAIN, is_default=true)` whenever a location is created.
  - Default Warehouse Enforcement: When creating or updating a warehouse with `is_default = true`, all other warehouses at that `location_id` have `is_default` reset to `false` in the same transaction.
  - Active Location Scoping: Requests carrying an inactive `siteId` / `locationId` header are rejected by `enforceActiveLocation` middleware.

---

## Module 6: Real-Time Inventory Ledger & Lot-Level Storage
* **Frontend Files**: [`frontend/src/pages/Inventory.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Inventory.jsx).
* **Database Tables**: `public.inventory_lots`, `public.inventory_transactions`.
* **API Routes**:
  - `GET /api/pg/inventory/lots` (Query: `material_id`, `warehouse_id`, `status`)
  - `GET /api/pg/inventory/ledger` (Query: `lot_id`, `material_id`, `start_date`, `end_date`)
  - `POST /api/inventory/inward` (Inward stock receipt, creates lot and posts transaction)
  - `POST /api/inventory/outward` (Manual consumption / scrap with mandatory reason)
  - `POST /api/inventory/transfer` (Inter-warehouse transfer with optimistic locking)
  - `POST /api/inventory/adjust` (Inventory count adjustment with audit diff)
* **Functional Logic & UI Behavior**:
  - Canonical Inventory Formula (Sheet 4):
    $$\text{Inventory} = \text{Material} + \text{Quantity} + \text{UOM} + \text{Location} + \text{Lot \#} + \text{Warehouse}$$
  - Availability Calculation: $\text{Available Qty} = \text{Quantity On-Hand} - \text{Reserved Qty}$.
  - Lot States: `AVAILABLE`, `QUARANTINED` (pending QC), `RESERVED` (held for production), `DEPLETED`.
  - FIFO / FEFO Engine: Queries lots ordered by `expiry_date ASC, created_at ASC` to prioritize oldest unexpired lots for reservation.
  - Double-Entry Ledger: Every change posts to `inventory_transactions` with `transaction_type` (`RECEIPT`, `ISSUE`, `ADJUSTMENT`, `TRANSFER`, `SCRAP`), `quantity`, `reference_type` (`PO`, `BATCH`, `TRANSFER`), and `reference_id`.

---

## Module 7: Planning & MRP Engine (Plan Summary & Short/Long Drill-Down)
* **Frontend Files**: [`frontend/src/pages/MRP.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/MRP.jsx), [`frontend/src/pages/Scheduling.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Scheduling.jsx).
* **Database Tables**: `public.plans`, `public.plan_products`, `public.mrp_runs`, `public.mrp_run_warehouses`, `public.planning_requirements`.
* **API Routes**:
  - `GET /api/pg/plans`, `POST /api/pg/plans`, `GET /api/pg/plans/:id`
  - `GET /api/pg/plans/:id/summary` (Returns Plan Summary & Batch Summary matching Sheet 3)
  - `GET /api/pg/plans/:id/materials` (Returns Material Summary with Short/Long status)
  - `GET /api/pg/plans/:id/material-drilldown` (Returns multi-warehouse lot breakdown matching Sheet 5)
  - `POST /api/mrp/run` (Triggers explosion and shortage analysis)
* **Functional Logic & UI Behavior**:
  - **Plan Summary View (Sheet 3)**:
    - Lists Product, No. of Batches, Target Output Qty, Executed Batches, Remaining Batches to be Executed.
  - **Batch Summary Schedule (Sheet 3)**:
    - Generates discrete batch entries (e.g. `BCH-2609-01` to `BCH-2609-05`) with Batch No, Mfg Date, Exp Date, and target Batch Qty.
  - **Material Summary & Short/Long Calculation (Sheet 3)**:
    - Computes: $\text{Short / Long} = \text{Available Quantity} - \text{Required Quantity}$.
    - If $\text{Short / Long} < 0$, flagged as RED SHORTAGE with automated PR creation button.
    - If $\text{Short / Long} \ge 0$, flagged as GREEN SURPLUS.
  - **Multi-Location / Multi-Warehouse Lot Drill-Down (Sheet 5)**:
    - Clicking any material line opens the multi-warehouse breakdown across Mumbai (`WH-01`, `WH-02`), Pune (`WH-01`, `WH-03`), and Bengaluru (`WH-01`, `WH-02`, `WH-04`), displaying specific lot numbers, manufacturing dates, expiry dates, and lot quantities.

---

## Module 8: Shop Floor & Batch Execution (Variance Gate & Genealogy)
* **Frontend Files**: Dedicated Batch Execution Entry modal/drawer (reproducing Sheet 2).
* **Database Tables**: `public.production_orders`, `public.production_order_components`, `public.batch_records`, `public.batch_actual_inputs`, `public.batch_actual_input_lots`.
* **API Routes**:
  - `GET /api/pg/batches`, `GET /api/pg/batches/:id`
  - `POST /api/pg/batches` (Creates batch from Plan or Ad-Hoc)
  - `PUT /api/pg/batches/:id/consume` (Updates actual material inputs and lot selections)
  - `POST /api/pg/batches/:id/complete` (Executes 5% variance validation and atomic inventory posting)
* **Functional Logic & UI Behavior (Sheet 2 Specification)**:
  - **Header Details**: Source (`Plan` with `Plan ID` or `Ad-Hoc`), Product, Batch No, Mfg Date, Expiry Date, Executed By (Operator).
  - **Output vs Plan**: Plan Output Qty (kg) vs Actual Output Qty (kg), Variance (kg), and Output Variance %.
  - **Material Inputs BOM vs Actual**:
    - Displays Material (MPN), Vendor, BOM %, Lot # selected, Plan Input (kg), Actual Input (kg), and Variance %.
    - Variance Formula: $\text{Variance \%} = \frac{\text{Actual Input} - \text{Plan Input}}{\text{Plan Input}} \times 100$.
  - **5.0% Variance Tolerance Gate**:
    - Configured default tolerance: $5.0\%$.
    - If $|\text{Variance \%}| > 5.0\%$, the **Reason for Variance** text field becomes strictly mandatory (e.g. *"Higher moisture in cocoa mass lot CM-2501-A"*).
    - Submitting without reason is rejected with `400 ValidationError`.

---

## Module 9: Fully Automatic Inventory Update (Execution Side-Effects)
* **Backend Services**: `backend/services/inventoryLedgerService.js`, `backend/controllers/pg/batchExecutionController.js`.
* **Database Interaction**: Atomic multi-table PostgreSQL transaction.
* **Functional Logic & Execution Flow (Sheet 1 & 4)**:
  - Triggered immediately upon successful batch completion (`POST /api/pg/batches/:id/complete`).
  - Step 1: Deducts consumed raw material quantities from each selected `inventory_lots` row.
  - Step 2: Posts corresponding `ISSUE` rows to `inventory_transactions` referencing `batch_id`.
  - Step 3: Instantiates a new finished good lot in `inventory_lots` (e.g. `Milk Chocolate Bar 100g`, Lot `BCH-2609-01`, Qty `1,940 kg`, Mfg `01-Sep-2026`, Exp `31-Aug-2027`, Status `QUARANTINED` pending final QC release).
  - Step 4: Posts a `RECEIPT` row to `inventory_transactions`.
  - Step 5: Stores ingredient lot genealogy in `batch_actual_input_lots` for end-to-end recall traceability.
  - No manual inventory entry required.

---

## Module 10: Quality Assurance & Control (Incoming, In-Process, CAPA)
* **Frontend Files**: [`frontend/src/pages/Quality.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Quality.jsx).
* **Database Tables**: `public.quality_records`.
* **API Routes**:
  - `GET /api/quality/inspections`, `POST /api/quality/inspections`, `PUT /api/quality/inspections/:id`
  - `POST /api/quality/disposition` (Applies disposition: `PASS`, `FAIL`, `REWORK`, `QUARANTINE`)
* **Functional Logic & UI Behavior**:
  - Incoming Goods Inspection: Goods receipts create lots in `QUARANTINED` status. Passing QC updates lot status to `AVAILABLE`.
  - Finished Goods Release: Newly manufactured batch lots remain quarantined until quality technicians record release test results.
  - Failing an inspection blocks lot issuance and generates a non-conformance CAPA ticket.

---

## Module 11: Procurement & Purchasing Flow (PR $\rightarrow$ PO $\rightarrow$ GRN)
* **Frontend Files**: [`frontend/src/pages/Purchasing.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Purchasing.jsx), [`frontend/src/pages/PurchaseRequests.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/PurchaseRequests.jsx).
* **Database Tables**: `public.purchase_requests`, `public.purchase_request_items`, `public.purchase_orders`, `public.purchase_order_items`, `public.purchase_order_receipts`.
* **API Routes**:
  - `GET /api/procurement/purchase-requests`, `POST /api/procurement/purchase-requests`, `PUT /api/procurement/purchase-requests/:id/status`
  - `GET /api/procurement/purchase-orders`, `POST /api/procurement/purchase-orders`, `PUT /api/procurement/purchase-orders/:id/issue`
  - `POST /api/procurement/receipts` (Creates GRN and posts quarantined inward lot)
* **Functional Logic & UI Behavior**:
  - PR Lifecycle: `DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `APPROVED` $\rightarrow$ `CONVERTED`.
  - PO Lifecycle: `DRAFT` $\rightarrow$ `ISSUED` $\rightarrow$ `PARTIALLY_RECEIVED` $\rightarrow$ `RECEIVED` $\rightarrow$ `CLOSED` / `CANCELLED`.
  - 3-Way Matching: Verifies PO Line Price & Qty against physical GRN Receipt and Vendor Invoice before authorising accounts payable.

---

## Module 12: Workflow Automation & Multi-Tier Approvals
* **Frontend Files**: [`frontend/src/pages/Workflows.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/Workflows.jsx).
* **Database Tables**: `public.approval_workflows`, `public.approval_steps`, `public.approval_requests`, `public.approval_decisions`, `public.workflows`, `public.workflow_executions`.
* **API Routes**:
  - `GET /api/workflows`, `POST /api/workflows`, `PUT /api/workflows/:id`
  - `GET /api/approvals/pending`, `POST /api/approvals/:id/decide`
* **Functional Logic & UI Behavior**:
  - Multi-tier thresholds (e.g. POs over $\$10,000$ require two levels of managerial approval).
  - Segregation of Duties (SoD): The record creator cannot approve their own requisition.

---

## Module 13: Visitor, Gate & Facility Security
* **Frontend Files**: Dedicated Gate & Visitor Management screens.
* **Database Tables**: `public.visitors`, `public.appointments`.
* **API Routes**:
  - `GET /api/visitors`, `POST /api/visitors`, `POST /api/visitors/:id/badge`
  - `GET /api/appointments`, `POST /api/appointments`, `PUT /api/appointments/:id/check-in`, `PUT /api/appointments/:id/check-out`
* **Functional Logic & UI Behavior**:
  - Generates visitor badges with QR codes and enforces safety induction / NDA acceptance.
  - Maintains a real-time on-premises headcount log for emergency evacuation reporting.

---

## Module 14: Asynchronous Email & Notification Engine
* **Frontend Files**: [`frontend/src/pages/EmailTemplates.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/pages/EmailTemplates.jsx).
* **Database Tables**: `public.notifications`, `public.email_templates`, `public.email_queue`, `public.email_log`.
* **API Routes**:
  - `GET /api/notifications`, `PUT /api/notifications/:id/read`
  - `GET /api/email-templates`, `POST /api/email-templates`, `PUT /api/email-templates/:id`
* **Functional Logic & UI Behavior**:
  - BullMQ background worker polls `email_queue` and delivers dynamic HTML messages with exponential backoff on failure.
  - Dispatches automated alerts for inventory shortages, PO approvals, and vendor document expirations.

---

## Module 15: Enterprise AI Copilot & MCP Tools
* **Frontend Files**: [`frontend/src/components/EnterpriseAICopilot.jsx`](file:///c:/Users/Rorosaur_2/OneDrive/VMS/vms-project/frontend/src/components/EnterpriseAICopilot.jsx).
* **API Routes**: `/api/chat/message`, `/api/mcp/tools`.
* **Functional Logic & UI Behavior**:
  - Natural language querying across materials, vendors, inventory levels, and production schedules.
  - Anomaly detection flagging abnormal scrap rates and supplier delivery delays.

---

# 4. Master Data Flow & Operational Sequence

```mermaid
sequenceDiagram
    autonumber
    participant MD as Master Data (Mat/Ven/MPN)
    participant BOM as BOM Engineering
    participant PLN as Planning & MRP
    participant PO as Purchasing (PO/GRN)
    participant INV as Inventory Ledger (Lots)
    participant MFG as Batch Execution
    participant QC as Quality Control

    Note over MD,BOM: 1. Setup Phase
    MD->>BOM: Materials, Vendors & MPN prices configured
    BOM->>BOM: Recipe defined (Batch size vs output yield, scrap factor %, location linked)

    Note over PLN,PO: 2. Planning Phase
    PLN->>BOM: Fetch approved active BOM revision
    PLN->>INV: Check stock availability across warehouses (WH-01, WH-02...)
    PLN->>PLN: Generate Plan Summary, Batch Schedule & Material Short/Long
    PLN->>PO: Trigger PO for short materials (if any)
    PO->>INV: GRN receipt posted -> Inward lot created in QUARANTINED state
    QC->>INV: Incoming QC inspection passed -> Lot released to AVAILABLE

    Note over MFG,INV: 3. Execution Phase
    MFG->>PLN: Select Plan (or create Ad-Hoc batch)
    MFG->>INV: View available ingredient lots by warehouse (FIFO)
    MFG->>MFG: Enter Actual Consumed Qty per ingredient & select physical Lot #
    MFG->>MFG: Calculate Variance %; Enforce mandatory reason if > 5.0% tolerance
    MFG->>MFG: Enter Actual Output Qty

    Note over MFG,INV: 4. Fully Automatic Inventory Update
    MFG->>INV: Transactional commit:
    INV->>INV: Deduct consumed ingredient lots (immutable ISSUE transaction)
    INV->>INV: Create Finished Good Lot (immutable RECEIPT transaction)
    MFG->>QC: Submit finished lot for QC release
    QC->>INV: QC Release sign-off -> Finished Goods ready for dispatch
```

---

# 5. Enforcement & Execution Verification Protocol

### The Stop-and-Realign Checklist
Before and during any code execution, the following 10 validation checks must be conducted:
1. **Zero-Deletion Verification**: Does this change delete, rename, or drop any field or UI component from `MaterialsTab`, `VendorsTab`, `MPNMaster`, `BomRecipeEditor`, or `Inventory`? $\rightarrow$ **If YES, STOP IMMEDIATELY.**
2. **50-Record Pagination**: Is the 50-row default pagination preserved on all master tables? $\rightarrow$ **If NO, STOP IMMEDIATELY.**
3. **Location Hierarchy**: Does every new location auto-generate a default warehouse (`is_default = true`)? $\rightarrow$ **If NO, STOP IMMEDIATELY.**
4. **GiST Exclusion**: Are vendor prices protected against overlapping date windows? $\rightarrow$ **If NO, STOP IMMEDIATELY.**
5. **Negative Stock Check**: Can any transaction drive `quantity_on_hand` below zero? $\rightarrow$ **If YES, STOP IMMEDIATELY.**
6. **Immutable Ledger**: Are stock balances updated directly without an `inventory_transactions` entry? $\rightarrow$ **If YES, STOP IMMEDIATELY.**
7. **BOM Versioning**: Does the DB permit more than one active BOM per product? $\rightarrow$ **If YES, STOP IMMEDIATELY.**
8. **5% Batch Tolerance Gate**: Can a batch with $> 5.0\%$ material variance be completed without an audited reason? $\rightarrow$ **If YES, STOP IMMEDIATELY.**
9. **Automatic Inventory Relief**: Does batch completion require manual stock entry? $\rightarrow$ **If YES, STOP IMMEDIATELY (must be fully automatic).**
10. **Transaction Isolation**: Are multi-table writes wrapped in a single database transaction? $\rightarrow$ **If NO, STOP IMMEDIATELY.**

---
*This specification is permanently recorded as `docs/MASTER_SYSTEM_SPECIFICATION.md` and serves as the inviolable contract for all engineering and development work on this platform.*

