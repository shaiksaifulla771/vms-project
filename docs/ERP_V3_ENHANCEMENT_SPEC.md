# VMS ERP v3: Navigation and Master Data Enhancement Spec

Owner: Shaik Saifulla · Written: 2026-09-23 · Base: `master` @ 63c4c24 (ERP v2 merged)

This file is the working memory for the v3 changes. It records what was asked, how it was interpreted, the decisions made, and what is done and still to do. Update the tracker each session.

---

## 0. Progress tracker

| Phase | Scope | Status |
|---|---|---|
| P0 | Analyse request, write this spec, confirm open questions | Done |
| P1 | Sidebar: collapsible, accordion groups, reordered | Done |
| P2 | Auto codes (M/V/MPN) + shared list toolbar (Functions menu, Actions column) | Done |
| P3 | Material Master: category, sub-category, description, status, bulk | Done |
| P4 | Vendor Master: linked materials, addresses, contacts, FSSAI, bank, bulk | Done |
| P5 | MPN: bulk create (material + vendor + UOM + MOQ + price), bulk update, export | Done |
| P6 | BOM: packing and other costs, richer ingredient lines, scale recipe | Done |
| P7 | Verify: all old tests pass, new tests, UI walkthrough, push branch, PR | Verified (33/33 tests, all pages load). Waiting for you to push `feat/v3-master-data` and merge the PR |

---

## 1. Your request, line by line

| # | What you wrote (paraphrased) | How it is interpreted |
|---|---|---|
| 1 | "Everything is perfect, make some changes" | v2 stays as the base. All changes are additions. |
| 2 | "Adding sliding bar at top too" | A toggle button in the top header to collapse or expand the left sidebar. Collapsed shows icons only. |
| 3 | "Sub modules have to be inside, come out when user clicks" | Sidebar groups become accordions: sub-items stay hidden until the group is clicked. The active page's group opens automatically. |
| 4 | "Recheck which modules come first and next" | Reorder the sidebar to follow the system flow (see §3). |
| 5 | "Major changes in Material, Vendor, BOM, MPN; don't break existing features" | Additive database migrations (006+). Existing APIs keep working. Planning, batches and the ledger are not touched. |
| 6 | Material: "function list with manual entry, bulk entry, bulk update, export" | A **Functions** menu on the list page with 4 options (see §4). |
| 7 | "Action header with view, edit, delete symbols" | Last table column **Actions** with eye, pencil and trash icons. |
| 8 | "Unique auto-assigned number M1001… never reused; vendor V1001; MPN 1001" | Database sequences assign codes on insert. Codes are read-only and never reused, even after delete (§5). |
| 9 | BOM: "packing cost and some other costs" | BOM header costs: Packing, Processing, Overhead and Freight (confirmed). Material cost and cost per unit are calculated (§9). |
| 10 | Material: "status, category, sub-category to select, description" | A Category master with sub-categories. The sub-category dropdown filters by the chosen category (§6). |
| 11 | Vendor: "same function list" | Same Functions menu and Actions column as Materials. |
| 12 | Vendor manual entry: "select material and select vendor to link, status" | The vendor form has a "Supplied materials" multi-select that links materials to the vendor (§7). |
| 13 | "Address details, add another address, editable address name, default, primary or secondary" | Multiple addresses per vendor. Each has a name you can edit, a type (Primary or Secondary) and one Default flag (§7). |
| 14 | "Add phone no, FSSAI, fifo expiry" | Phone, FSSAI licence no. and **FSSAI expiry date** (confirmed). |
| 15 | "Bank details: account number, IFSC, bank holder name" | A Bank section: account holder, account number, IFSC, bank name and branch. |
| 16 | "Email; above this the contact directory" | A Contact directory (name, designation, phone, email; many rows) placed above the Bank section. |
| 17 | MPN: "bulk MPN create: material and vendor selected, UOM, MOQ, price defined" | A bulk-create grid: each row picks material + vendor + UOM + MOQ + price. The MPN code is auto-assigned (§8). |
| 18 | BOM: "scalability option" | A **Scale recipe** action: enter a new batch size and every quantity scales in proportion. The result saves as a new Draft version (§9). |
| 19 | BOM: "while adding ingredients there was some other data" | Ingredient lines gain MPN / vendor, price (from the MPN), loss %, line cost and notes (§9). |
| 20 | "Make memory of what was done and what remains" | This file plus project memory, updated each phase. |

---

## 2. Guardrails (apply to every phase)

- **Nothing existing breaks.** The 21 current workflow tests must still pass, and each phase adds its own tests.
- **Additive schema only.** New migrations `006_…`, `007_…`. No drops. New columns are nullable or have defaults.
- **The inventory ledger stays the single source of truth.** Master-data changes never write stock.
- **Zoho style.** White background, grey borders, one blue accent, dense tables, simple forms, no gradients.
- **No hardcoding.** Categories, UOMs and similar lists come from the database.
- **Delete means deactivate** when a record is in use by an MPN, BOM, inventory or ledger row. Hard delete is allowed only for unused Draft records. Codes are never reused either way.
- **Roles are not touched yet.** This follows your earlier decision.

---

## 3. Navigation (P1)

**Header:** a collapse toggle (☰) at top-left, then the global Location / WH selector and the acting user, as now.

**Sidebar behaviour**
- Expanded: about 220 px wide, showing group titles with a chevron. Clicking a group opens or closes its sub-items.
- Collapsed: about 56 px wide, icons only. Hovering an icon shows a flyout with that group's sub-items.
- The group containing the current page opens automatically.
- The browser remembers whether the sidebar is collapsed or expanded.

**Order (follows the system flow Master Data → MPN → BOM → Inventory → Planning → Manufacturing → Reports)**

1. **Master Data**: Materials · Vendors · MPNs · BOMs · Locations & WH
2. **Inventory**: Stock · Transfers
3. **Planning**: Plans · New Plan
4. **Manufacturing**: Batches · Batch Entry
5. **Reports**: Stock Balance · Physical Stock Sheet · Transactions · Traceability
6. **Settings**: General (variance tolerance) · Categories (new)

Why this order: Vendors come before MPNs because an MPN links a material to a vendor. BOMs come after MPNs because BOM lines can pick an MPN.

---

## 4. Shared list-page pattern (P2)

This applies to Materials, Vendors and MPNs, and to BOMs where it makes sense.

**Functions menu** (a button next to the primary "New" button):

| Option | Behaviour |
|---|---|
| Manual Entry | Opens the create form, same as "New". |
| Bulk Entry | 1) Download the XLSX/CSV template. 2) Upload it. 3) Preview grid with per-row validation (errors in red with the reason). 4) Commit is **all-or-nothing** in one transaction. 5) The result shows how many were created and the new codes. |
| Bulk Update | 1) Export the current records as a template keyed by code. 2) Edit and re-upload. 3) Preview shows **only changed fields** (old → new). 4) Commit all-or-nothing. Codes can't be changed. |
| Export | Downloads all records as XLSX or CSV (the same columns as the Bulk Update template). |

**Actions column** (last column): 👁 View (read-only detail) · ✎ Edit · 🗑 Delete, with a confirm dialog. When the record is in use, delete becomes "Deactivate" and the dialog says why.

---

## 5. Auto-numbering (P2)

| Entity | Format | Starts | Rule |
|---|---|---|---|
| Material | `M` + number | M1001 | Database sequence. Assigned on insert. Read-only. Never reused. |
| Vendor | `V` + number | V1001 | Same |
| MPN | `MPN` + number | MPN1001 | Same |
| BOM | `BOM-` + number | BOM-1001 | Already in place |

- Numbers come from a Postgres sequence, so two users saving at the same moment never get the same code.
- Gaps are normal: a deleted or failed insert uses up its number, which is what "never reused" requires.
- Bulk Entry assigns codes in row order.

**Existing data (live Supabase: 109 materials, 43 vendors, 109 MPNs)** currently has codes like `RM-SUGAR`, `FG-CB1` and `V-147297F8`. **Decision: existing records keep their codes**; only new records get M/V/MPN numbers.

---

## 6. Material Master (P3)

**New tables:** `material_categories` (id, name, parent_id → sub-category, status). It is managed under Settings → Categories.

**Material form fields**

| Field | Type | Notes |
|---|---|---|
| Material Code | auto | M1001… |
| Material Name | text, required | |
| Classification | select | Existing: Raw Material, Packaging, Consumable, Semi-Finished, Finished Good. Drives planning and batches, so it stays. |
| Category | select | From the category master |
| Sub-category | select | Filtered by the chosen category |
| UOM | select | |
| Shelf life (days) | number | Existing |
| Status | select | Active / Inactive (Draft is optional, see Q4) |
| Description | textarea | New |

List columns: Code · Name · Classification · Category · Sub-category · UOM · Status · Actions.

---

## 7. Vendor Master (P4)

**Form layout (sections, top to bottom)**

1. **Basic**: Vendor Code (auto V1001…) · Vendor Name · Status · Phone · Email · GSTIN · FSSAI Licence No. · FSSAI Expiry (warns when expired or within 30 days).
2. **Supplied materials**: multi-select of materials to link to this vendor.
3. **Addresses**: repeatable card, "+ Add another address".
   - Address Name (editable, e.g. "Head Office", "Plant 2")
   - Line 1, Line 2, City, State, PIN, Country
   - Type: Primary / Secondary
   - ☐ Default (only one per vendor; the database enforces it)
4. **Contact directory**: repeatable rows of Name · Designation · Phone · Email.
5. **Bank details**: Account Holder Name · Account Number · IFSC (format checked) · Bank Name · Branch.
   - In the list and View, the account number is masked (`XXXXXX1234`). Edit shows it in full.

**New tables:** `vendor_addresses`, `vendor_contacts`, `vendor_bank_accounts`, `vendor_materials`. New columns on `vendors`: `fssai_no`, `fssai_expiry`.

**How "Supplied materials" relates to MPNs:** linking a material to a vendor is a sourcing link only. It creates no MPN. MPNs (with price and MOQ) are still created in the MPN screen, where the material and vendor dropdowns suggest these links first.

---

## 8. MPN (P5)

**Bulk MPN Create** (grid, "+ Add row", paste from Excel supported)

| Material (select) | Vendor (select) | UOM | MOQ | Price (₹) | Price per UOM | Lead time (days) | Preferred ☐ |

- Each row creates one MPN (auto code) linked to the material, plus the vendor mapping with its price and MOQ.
- Validation: material and vendor must be active, MOQ > 0, price ≥ 0, and the same material + vendor pair can't be repeated.
- One preferred vendor per MPN (already enforced).

**New columns on `mpn_vendors`:** `uom`, `moq`, `price`, `currency` (default INR), `price_updated_at`. Price changes are kept in `mpn_price_history`.

Bulk Update and Export follow the §4 pattern.

---

## 9. BOM (P6)

**Header costs (per batch, ₹)**: Packing cost · Processing cost · Overhead cost · Freight cost.

**Calculated:**
- Material cost = Σ (line qty × (1 + loss %) × line price)
- Total batch cost = material + packing + processing + overhead + freight
- **Cost per output unit** = total ÷ expected output qty

**Ingredient line fields**

| # | Ingredient / MPN (search) | Material name | Vendor (from MPN) | Qty per batch | UOM | Loss % | Price (from MPN, can be overridden) | Line cost | Notes |

- Loss % is the existing scrap allowance. Planning keeps its "apply scrap allowance" option.
- Price defaults to the preferred MPN vendor's price. An override is stored on the line.

**Scale recipe:**
1. Pick a BOM and enter the new batch size.
2. Preview shows factor = new ÷ old, with each old and new quantity and the expected output.
3. Save creates a **new Draft version**. The Active BOM is untouched until you activate the new version.

---

## 10. Decisions (confirmed 2026-09-23)

1. **Existing codes are kept.** Only new records get M1001… / V1001… / MPN1001…
2. **MPN code format:** `MPN1001`.
3. **"fifo expiry"** means the FSSAI licence expiry date.
4. **BOM costs:** Packing, Processing, Overhead and Freight.

## 11. Session log

- 2026-09-23: v2 merged to master (63c4c24). Request analysed and this spec written. Old code reviewed (Mongo models Material, Vendor, MPN, BOMHeader, BOMItem, BomRecipeEditor, BomScale, Sidebar) to recover the original fields: vendor addresses, FSSAI, bank, BOM packaging/processing/overhead, loss %, scale. Live Supabase checked: existing codes are not in the M/V pattern.
- 2026-09-23: Decisions confirmed (§10). Starting P1.
- 2026-09-23: P1–P6 built on branch `feat/v3-master-data` (base: master 63c4c24).
  - DB: migration `006_master_data_v3.sql`. Additive only. It applies automatically the first time the new backend starts (AUTO_MIGRATE=true), so it has **not** been applied to Supabase by hand. Old code would reject new vendor codes, so the migration must ship together with the new code.
  - Checked on a local copy of the live data: 43 existing vendor addresses were moved into the address book, 85 vendor-material links were created from the existing MPNs, and the next material code is M1002 (M1001 already exists).
  - Backend: `services/masterData.js` holds the shared write rules; `services/bulk.js` handles templates, parse, preview and all-or-nothing commit; new routes `categories`, `bulk`, `mpns/bulk`, `boms/:id/scale`; DELETE on materials, vendors, MPNs and categories (a record that is in use is deactivated instead).
  - Frontend: collapsible accordion sidebar; masterKit (Functions menu, Actions column, BulkDialog, DeleteDialog, MultiSelect); Materials, Vendors (form and view pages), MPNs (+ Bulk MPN Create grid, price history), BOM costs and Scale Recipe, Settings > Categories.
  - Tests: 21 existing + 12 new = 33 passing.

## 12. Still open

- Push `feat/v3-master-data` from PowerShell, open the PR and merge it.
- The first backend start after merging applies migration 006 to Supabase automatically.
- Create material categories under Settings > Categories, then assign them (Bulk Update works well for this).
- Enter vendor prices (MPN Bulk Update or the Bulk MPN Create grid) so BOM costing shows real numbers.
- Carried over from earlier: Manager role for variance override (roles deferred), and reviewing BOM expected output quantities and UOMs.
