# Domain Model — Phase 1

The VMS domain has four groups: **Masters** (vendors, materials,
products), **Mapping** (MPN + vendor pricing), **Procurement**
(purchase requests, purchase orders, receipts), and **Governance**
(user profiles, audit log). Materials and vendors are separate entities
by design — they are never merged into one "item" table, matching the
ERP-SYSTEM convention this system integrates with.

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
```
