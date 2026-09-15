# Domain Model

The VMS domain has six groups: **Masters** (vendors, materials,
products), **Mapping** (MPN + vendor pricing), **Procurement**
(purchase requests, purchase orders, receipts), **Locations &
Inventory** (warehouses, lot-tracked stock, an append-only ledger),
**Planning & Manufacturing** (demand plans, batch execution, dynamic
corrections), and **Governance** (user profiles, audit log). Materials
and vendors are separate entities by design — they are never merged
into one "item" table, matching the ERP-SYSTEM convention this system
integrates with.

Sections 1–8 (Masters, Mapping, Procurement) are the original domain.
Sections 10–14 (Locations, Inventory, Planning, Manufacturing,
Corrections) extend it without ever modifying `materials`, `vendors`,
`material_vendors`, or `boms`/`bom_items` — every new table connects to
them only by foreign key.

---

## 1. Vendors
Represents an external supplier that the organization does business with.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | no | primary key |
| `code` | VARCHAR(50) | no | UNIQUE, business-facing identifier |
| `name` | VARCHAR(150) | no | UNIQUE |
| `legal_name` | VARCHAR(200) | yes | registered legal entity name |
| `status` | `vendor_status` enum | no | see lifecycle below |
| `contact_email` | VARCHAR(150) | yes | |
| `phone` | VARCHAR(20) | yes | |
| `gstin` | VARCHAR(15) | yes | India GST number, format-checked |
| `pan` | VARCHAR(10) | yes | India PAN, format-checked |
| `payment_terms_days` | INT | no | default 30, `>= 0` |
| `credit_limit` | NUMERIC(18,2) | no | default 0, `>= 0` |
| `city`, `state`, `country` | VARCHAR | yes | |
| `address_line1`, `address_line2`, `postal_code` | VARCHAR | yes | |
| `notes` | TEXT | yes | |
| `created_by`, `updated_by` | UUID | no / yes | `NOT NULL DEFAULT auth.uid()` on create |
| `created_at`, `updated_at` | TIMESTAMPTZ | no | |

**Lifecycle:** `DRAFT → APPROVED → ACTIVE ↔ SUSPENDED → BLACKLISTED`
- Only an `APPROVED` or `ACTIVE` vendor may appear on an issued PO.
- `BLACKLISTED` is terminal; a blacklisted vendor cannot be reactivated —
  a new vendor record must be opened.
- Every state transition is recorded in `audit_log`.

---

## 2. Materials
A raw material, packaging item, or intermediate that the organization
purchases or produces. Deliberately not merged with `products`.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | no | |
| `code` | VARCHAR(50) | no | UNIQUE |
| `name` | VARCHAR(150) | no | |
| `classification` | `item_classification` enum | no | `RAW_MATERIAL`, `PACKAGING`, `EMULSIFIER`, `CONSUMABLE`, `FINISHED_GOOD` |
| `uom` | VARCHAR(20) | no | default `'kg'` |
| `hsn_code` | VARCHAR(20) | yes | tax classification |
| `safety_stock` | NUMERIC(18,4) | no | default 0, `>= 0` |
| `reorder_point` | NUMERIC(18,4) | no | default 0, `>= 0` |
| `moq` | NUMERIC(18,4) | no | default 1, `> 0` |
| `lead_time_days` | INT | no | default 7, `>= 0` |
| `is_hazardous` | BOOLEAN | no | default false |
| `status` | `master_data_status` enum | no | `ACTIVE`/`INACTIVE`/`DRAFT` |
| audit fields | | | as above |

---

## 3. Products
A finished good the organization sells. Ships to VMS mostly for BOM
context and MPN reconciliation with ERP.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | no | |
| `sku` | VARCHAR(50) | no | UNIQUE |
| `name` | VARCHAR(150) | no | UNIQUE |
| `uom` | VARCHAR(20) | no | default `'units'` |
| `pack_size` | NUMERIC(12,4) | yes | grams / units per pack |
| `status` | `master_data_status` enum | no | |
| audit fields | | | |

---

## 4. Bill of Materials (BOM, optional read-model from ERP)
VMS treats BOM as a read-only projection to enable "which materials do
we need for product X" queries used by procurement forecasts.

- `boms`: `(id, product_id, version, is_active, created_at)`
- `bom_items`: `(id, bom_id, material_id, formula_percentage, standard_qty, uom)`
- UNIQUE `(product_id, version)`; at most one `is_active` BOM per
  product, enforced by a partial unique index.

---

## 5. Material ↔ Vendor mapping (MPN)
The core of VMS. One row = "vendor V supplies material M, under vendor
part number X". Many-to-many.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | no | |
| `material_id` | UUID | no | FK materials, ON DELETE RESTRICT |
| `vendor_id` | UUID | no | FK vendors, ON DELETE RESTRICT |
| `mpn_code` | VARCHAR(80) | no | vendor's own part number for this material |
| `specifications` | JSONB | no | default `'{}'` |
| `certifications` | TEXT[] | no | default `ARRAY[]::TEXT[]` |
| `is_hazardous` | BOOLEAN | no | default false |
| `purchase_approved` | BOOLEAN | no | default true |
| `is_preferred` | BOOLEAN | no | default false, **at most one preferred vendor per material** (partial unique index) |
| `moq` | NUMERIC(18,4) | no | vendor-specific MOQ |
| `lead_time_days` | INT | no | vendor-specific lead time |
| `status` | `master_data_status` enum | no | |
| audit fields | | | |

**Constraints:**
- UNIQUE `(material_id, vendor_id)` — one MPN row per pair
- UNIQUE `(vendor_id, mpn_code)` — a vendor cannot reuse a part number
- Partial UNIQUE on `(material_id) WHERE is_preferred = TRUE`

---

## 6. Vendor pricing (effective-dated, history preserved)
Rather than a single "current price" column on `material_vendors`, VMS
stores prices as a history: each row is valid over a date range. A quote
is never overwritten — a new one closes the previous.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | no | |
| `material_vendor_id` | UUID | no | FK material_vendors |
| `currency` | CHAR(3) | no | default `'INR'` |
| `unit_price` | NUMERIC(18,4) | no | `> 0` |
| `min_order_qty` | NUMERIC(18,4) | no | `> 0` |
| `valid_from` | DATE | no | |
| `valid_to` | DATE | yes | NULL means "still current"; an open-ended row |
| `source` | `price_source` enum | no | `QUOTE`, `CONTRACT`, `SPOT`, `PO_HISTORY` |
| `notes` | TEXT | yes | |
| audit fields | | | |

**Constraints (btree_gist required):**
- CHECK `valid_to IS NULL OR valid_to > valid_from`
- EXCLUDE USING gist on
  `(material_vendor_id WITH =, daterange(valid_from, COALESCE(valid_to, 'infinity'::date)) WITH &&)`
  — no two price rows for the same MPN can overlap in time.

The "current" price for an MPN is
`WHERE valid_from <= today AND (valid_to IS NULL OR valid_to > today)`.

---

## 7. Purchase Requests
An internal request for goods, raised before any vendor is committed to.

**Header — `purchase_requests`**

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | no | |
| `pr_number` | VARCHAR(30) | no | UNIQUE, `PR-YYYYMM-NNNNN` |
| `title` | VARCHAR(200) | no | |
| `status` | `pr_status` enum | no | `DRAFT / SUBMITTED / APPROVED / REJECTED / CONVERTED / CANCELLED` |
| `required_by` | DATE | no | |
| `justification` | TEXT | yes | |
| `submitted_at`, `decided_at` | TIMESTAMPTZ | yes | |
| `submitted_by`, `decided_by` | UUID | yes | FK user_profiles |
| `decision_notes` | TEXT | yes | |
| audit fields | | | |

**Lines — `purchase_request_items`**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `pr_id` | UUID | FK, ON DELETE CASCADE |
| `line_no` | INT | 1-based |
| `material_id` | UUID | FK materials |
| `quantity` | NUMERIC(18,4) | `> 0` |
| `uom` | VARCHAR(20) | |
| `suggested_vendor_id` | UUID | nullable |
| `notes` | TEXT | |
| UNIQUE `(pr_id, line_no)` | | |

**Lifecycle:**
`DRAFT → SUBMITTED → APPROVED → CONVERTED` (or `REJECTED` from
SUBMITTED, or `CANCELLED` from DRAFT/SUBMITTED). Only editor+ can
create/submit; only admin can approve/reject/convert.

---

## 8. Purchase Orders
The commitment sent to a vendor after PR approval. Each PO covers **one
vendor** — a PR spanning multiple vendors splits into multiple POs.

**Header — `purchase_orders`**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `po_number` | VARCHAR(30) | UNIQUE, `PO-YYYYMM-NNNNN` |
| `pr_id` | UUID | nullable (POs can be raised ad-hoc) |
| `vendor_id` | UUID | FK vendors |
| `status` | `po_status` enum | `DRAFT / ISSUED / PARTIALLY_RECEIVED / RECEIVED / CLOSED / CANCELLED` |
| `currency` | CHAR(3) | default `'INR'` |
| `subtotal` | NUMERIC(18,2) | denormalized |
| `tax_total` | NUMERIC(18,2) | |
| `grand_total` | NUMERIC(18,2) | |
| `expected_delivery_date` | DATE | |
| `issued_at`, `closed_at` | TIMESTAMPTZ | |
| `issued_by`, `closed_by` | UUID | |
| audit fields | | |
| `idempotency_key` | VARCHAR(80) | nullable UNIQUE — for safe PR→PO conversion retries |

**Lines — `purchase_order_items`**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `po_id` | UUID | FK, ON DELETE CASCADE |
| `line_no` | INT | |
| `material_id` | UUID | |
| `material_vendor_id` | UUID | nullable, FK MPN |
| `quantity_ordered` | NUMERIC(18,4) | `> 0` |
| `quantity_received` | NUMERIC(18,4) | default 0, `>= 0`, `<= quantity_ordered` |
| `unit_price` | NUMERIC(18,4) | `> 0` |
| `tax_percent` | NUMERIC(5,2) | default 0, `>= 0` |
| `line_total` | NUMERIC(18,2) | GENERATED, `quantity_ordered * unit_price * (1 + tax_percent/100)` |
| UNIQUE `(po_id, line_no)` | | |

**Receipts — `purchase_order_receipts`**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `po_id` | UUID | |
| `po_item_id` | UUID | |
| `receipt_number` | VARCHAR(30) | UNIQUE, `GRN-YYYYMM-NNNNN` |
| `received_qty` | NUMERIC(18,4) | `> 0` |
| `received_at` | TIMESTAMPTZ | default `now()` |
| `on_time` | BOOLEAN | computed at insert vs `expected_delivery_date` |
| `quality_ok` | BOOLEAN | receiver stamps at intake |
| `notes` | TEXT | |
| `created_by` | UUID | |
| UNIQUE `(po_item_id, receipt_number)` | | |

Every receipt row bumps `quantity_received` on its PO item and, if all
items are fully received, moves the header to `RECEIVED`. `CLOSED` is a
separate admin-only step after invoice reconciliation.

---

## 9. Governance
`user_profiles (id, full_name, email, role, created_at, updated_at)` —
same shape as ERP-SYSTEM's, so a single Supabase Auth tenant can back
both.

`audit_log (id, entity_type, entity_id, action, actor_id, before, after,
created_at)` — one row per business state transition (vendor status
change, PR decision, PO issue/close, etc.). Read-only from the API
layer; writes come from services only.

---

## 10. Locations & Warehouses
A `location` is a physical site (a plant, a depot); a `warehouse` is a
storage area within one. Every location gets a "Main Warehouse (WH-01)"
automatically on creation (`internal.trg_auto_create_default_warehouse`,
AFTER INSERT trigger) so a caller never has to remember to provision one.

| Table | Key fields | Notes |
|---|---|---|
| `locations` | `id`, `name` UNIQUE, `code` UNIQUE, `address` | audit fields as usual |
| `warehouses` | `id`, `location_id` FK RESTRICT, `name`, `code`, `is_default` | UNIQUE `(location_id, code)` |

---

## 11. Inventory — Lots & Ledger (FEFO)
Stock is tracked per **lot**, never as a single running total on the
material/product. `inventory_lots.quantity_on_hand` is a cached balance;
the source of truth is the append-only `inventory_transactions` ledger,
and the two are kept in lockstep by a single gateway function.

**`inventory_lots`**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `lot_number` | VARCHAR(100) | UNIQUE with `warehouse_id` |
| `material_id` / `product_id` | UUID, nullable | CHECK exactly one is set — a lot holds a raw material or a finished good, never both |
| `location_id`, `warehouse_id` | UUID | FK RESTRICT |
| `mfg_date`, `expiry_date` | DATE | CHECK `expiry_date > mfg_date` |
| `quantity_on_hand` | NUMERIC(18,4) | default 0, CHECK `>= 0` — the cached balance |
| `uom` | VARCHAR(20) | |
| audit fields | | |

Index `idx_lots_fefo (material_id, location_id, warehouse_id,
expiry_date)` backs First-Expiry-First-Out candidate selection.

**`inventory_transactions`** (append-only by DB grant, not just
convention — `INSERT`/`UPDATE`/`DELETE` are `REVOKE`d from
`authenticated` entirely)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `lot_id` | UUID | FK RESTRICT |
| `transaction_type` | `inventory_txn_type` enum | `INWARD_PURCHASE`, `OUTWARD_DISPOSAL`, `STOCK_ADJUSTMENT`, `MFG_CONSUMPTION`, `MFG_PRODUCTION`, `DYNAMIC_RECONCILIATION` |
| `quantity` | NUMERIC(18,4) | CHECK `<> 0`; signed — negative draws down, positive adds |
| `balance_after` | NUMERIC(18,4) | CHECK `>= 0` — this is what makes overdraw impossible |
| `reference_id` | VARCHAR(100) | nullable — a batch number, a manual entry's own reference |
| `reason_notes` | TEXT | nullable except where the caller mandates it (corrections, manual outward entries) |
| `executed_by` | UUID | NOT NULL — the acting user |
| `created_at` | TIMESTAMPTZ | |

The only writer is `internal.post_inventory_transaction(lot_id,
transaction_type, quantity, reference_id, executed_by, reason_notes)` —
a `SECURITY DEFINER` function that locks the lot row, reads its current
balance, validates the resulting balance would stay `>= 0` (the CHECK
constraint enforces this even if the function's own logic had a bug),
inserts the ledger row, and updates `inventory_lots.quantity_on_hand` —
all in one atomic step. `InventoryLedgerService.post_transaction()` is
the only application code path that calls it.

Manual **Inventory Entry** (Add Stock / Remove Stock) posts through this
exact same function — it is not a separate, less-audited code path from
batch consumption/production.

---

## 12. Planning
A `plan` is a group header covering demand across several
(product, location) pairs at once — it mirrors the source Plan Summary
report, which can list several products and locations under one plan.

**`plans`**: `id`, `plan_number` VARCHAR(30) UNIQUE (`PLAN-YYYYMM-NNNNN`),
`status` (`plan_status` enum: `DRAFT`/`ACTIVE`/`COMPLETED`/`CANCELLED`,
defaults `ACTIVE` — plans aren't approval-gated like PRs),
`idempotency_key` nullable UNIQUE, audit fields.

**`plan_products`** (one row per product × location within a plan):

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `plan_id` | UUID | FK CASCADE |
| `product_id` | UUID | FK RESTRICT |
| `location_id` | UUID | FK RESTRICT |
| `demand_target_qty` | NUMERIC(18,4) | CHECK `> 0` |
| `batch_size_output` | NUMERIC(18,4) | CHECK `> 0` — **planner-supplied, not read off `boms`** (see below) |
| `bom_id` | UUID | the active BOM resolved at plan-creation time, FK RESTRICT |
| `batches_required` | INT | `CEIL(demand_target_qty / batch_size_output)` — informational only |
| audit fields | | |

UNIQUE `(plan_id, product_id, location_id)`.

`batch_size_output` lives here rather than on `boms` deliberately: the
`boms`/`bom_items` tables are never modified by this domain, and
`qty_required = demand_target_qty × (bom_items.formula_percentage /
100)` never needed a batch size in the first place — `batches_required`
is the only figure that does, and it's purely a reporting number, never
an input to material requirement math. Planning is read-only against
inventory: `qty_available` is a lockless snapshot
(`InventoryLedgerService.get_available_qty`), and a `SHORT` line never
blocks plan creation — a Plan is a status report, not a reservation.

---

## 13. Manufacturing (Batch Execution)
A `batch_record` is one production run. It may be linked to a plan (via
`plan_id`) or raised ad-hoc (`plan_id IS NULL`) — both are validated
identically, with no reduced-validation path for either.

**`batch_records`**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `batch_number` | VARCHAR(30) | UNIQUE, `BCH-YYYYMM-NNNNN` |
| `plan_id` | UUID | nullable, FK SET NULL |
| `product_id`, `location_id`, `warehouse_id` | UUID | FK RESTRICT |
| `planned_output_qty` | NUMERIC(18,4) | CHECK `> 0` |
| `actual_output_qty`, `output_variance_qty`, `output_variance_pct`, `output_variance_reason` | nullable | filled in at completion |
| `mfg_date`, `expiry_date` | DATE | CHECK `expiry_date > mfg_date` |
| `status` | `batch_status` enum | `SCHEDULED → IN_PROGRESS → COMPLETED` (or `CANCELLED` from either open state) |
| `executed_by` | VARCHAR(100) | free-text operator name/badge — distinct from `created_by`, the real audit-trail actor |
| audit fields | | |

CHECK `chk_completed_has_actual_output`: `status = 'COMPLETED' ⟺
actual_output_qty IS NOT NULL`.

**`batch_actual_inputs`** — one row per (batch, BOM material), the
planned-vs-actual aggregate for that line: `bom_percentage`,
`planned_input_qty`, `actual_input_qty`, `variance_pct`,
`variance_reason`. UNIQUE `(batch_record_id, material_id)`.

**`batch_actual_input_lots`** — the specific lot(s) a material line's
consumption was actually drawn from (a line may split across several
FEFO-ordered lots): `batch_actual_input_id`, `consumed_lot_id`,
`quantity` CHECK `> 0`. UNIQUE `(batch_actual_input_id, consumed_lot_id)`.

**Completing a batch** (`BatchExecutionService.complete_batch`, one
atomic transaction):
1. Validate the batch is `IN_PROGRESS` and the submitted input lines
   match the active BOM's material set exactly.
2. Check output and per-material variance against
   `products.variance_tolerance_percent` (the sole additive column this
   domain adds to an existing VMS table) — `abs(variance_pct) >
   tolerance` requires a `reason_notes`, exactly at the boundary does not.
3. Select consumption lots: FEFO by default (oldest expiry first,
   splitting across lots as needed), or a manual `consumed_lot_id`
   override that must fall within the batch's own location/warehouse and
   carries a mandatory reason.
4. Lock the full union of consumed-material lots plus the new
   finished-goods lot, id-ascending, in one call — re-split the draw
   amounts against the freshly locked balances to close the gap between
   candidate selection and the lock (closing the TOCTOU window).
5. Post one `MFG_CONSUMPTION` per (material, lot) actually drawn and one
   `MFG_PRODUCTION` for the new finished-goods lot, through
   `InventoryLedgerService.post_transaction` — the only inventory writes
   in the whole flow.

**Inventory Auto-Update** is not a separate step — it is inside the same
transaction as completion, not a follow-up job.

---

## 14. Dynamic IP/OP Correction
A correction amends an already-`COMPLETED` batch's actual output or a
specific material line's actual consumption, **without ever editing the
original ledger rows**. It posts a new `DYNAMIC_RECONCILIATION`
transaction (append-only, same gateway function) and updates the
denormalized batch/input-line fields to match. `reason_notes` is
mandatory unconditionally here — unlike completion, where it's only
required above tolerance, a correction is by definition an after-the-fact
override of a number that was already accepted. A correction that would
drive a lot's `quantity_on_hand` negative (given consumption already
posted against it) is rejected before any write.

---

## 15. Governance
`user_profiles (id, full_name, email, role, created_at, updated_at)` —
same shape as ERP-SYSTEM's, so a single Supabase Auth tenant can back
both.

`audit_log (id, entity_type, entity_id, action, actor_id, before, after,
created_at)` — one row per business state transition (vendor status
change, PR decision, PO issue/close, batch completion, a correction,
etc.). Read-only from the API layer; writes come from services only.

---

## Relationships (summary)
```
vendors  1─┐
           │
           ├─N  material_vendors  N─┬─1  materials
           │       (MPN)            │
           │                        └─N  vendor_prices
           │                             (effective-dated history)
           │
           └─N  purchase_orders  1─N  purchase_order_items  1─N  receipts

products 1─N  boms  1─N  bom_items  N─1  materials

purchase_requests  1─N  purchase_request_items
purchase_requests  1─N  purchase_orders   (a PR fans out per vendor)

locations  1─N  warehouses

locations  1─N  inventory_lots  N─1  materials / products
inventory_lots  1─N  inventory_transactions   (append-only ledger)

plans  1─N  plan_products  N─1  products
plan_products  N─1  locations
plan_products  N─1  boms                       (active BOM at plan time)

plans  1─N  batch_records  (optional — plan_id nullable for ad-hoc batches)
batch_records  N─1  products / locations / warehouses
batch_records  1─N  batch_actual_inputs  N─1  materials
batch_actual_inputs  1─N  batch_actual_input_lots  N─1  inventory_lots
```
