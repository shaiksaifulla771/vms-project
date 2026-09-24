# VMS ERP v6: One Place for Vendor ↔ Material (MPN), Smart Inward / Outward, New Records on Top

Owner: Shaik Saifulla · Written: 2026-09-24 · Base: v5 (`feat/v5-master-options`) · Branch: `feat/v6-mpn-inward` · Status: **built, waiting for push**

## 0. Tracker

| Phase | Scope | Status |
|---|---|---|
| A | Vendor ↔ material link lives only in MPN (remove the other two entry points) | Done |
| B | Inward: pick material, the rest fills itself (MPN, vendor, UOM, expiry, location / WH, lot no) | Done |
| C | Outward: lots from every location / WH, picking a lot fills location / WH; reason list | Done |
| E | New records show at the top of every Master Data list, marked NEW, with an "added today" counter at the top right | Done |
| D | Verify: old tests pass, new tests, UI walkthrough, bundle for push | Verified (59/59 tests, screens checked). Waiting for you to push `feat/v6-mpn-inward` |

Rule for every phase: **nothing existing is removed or broken.** Old vendor ↔ material links are kept and shown (§2).

---

## 1. Your findings, checked against the code

| # | What you said | Checked | Verdict |
|---|---|---|---|
| 1 | The Material form lets me pick a vendor, and then that vendor shows the material | Yes: "First vendor (optional)" on New Material quietly creates an MPN with **no price, no MOQ** and links the vendor | **Bug (design).** A half-filled MPN is created from the wrong screen |
| 2 | Why do I pick materials in the Vendors tab? It should be done in MPN | Yes: Vendor form has "Supplied materials". It saves a link **without an MPN**, so no price, and Inward's vendor list never sees it | **Bug (design).** Same link entered in 3 places (Material, Vendor, MPN); only the MPN one is complete |
| 3 | On Inward / Outward, location, warehouse and other details should fill themselves | Partly. Inward fills vendor and expiry after you pick an MPN, and location / WH only from the top selector. With **"All locations"** at the top, Inward starts empty and Outward shows **no lots at all** until you choose a location | **Bug.** Should work from any selector setting and fill from what the system already knows |
| 5 | "Whenever new data is added it has to show at the top right in every Master Data, so it is easy" (added) | Today lists are sorted by code / classification, so a new record lands somewhere in the middle and the "created" message appears bottom right | **Improvement**, §4a |
| 4 | "MPN and BOM are created in one location and warehouse" | MPN is **not** tied to a location: a vendor's part is the same everywhere. BOM **is** tied to a location + WH. Stock (lots) is tied to location + WH | **Small correction**, used in §3 below |

---

## 2. Phase A: MPN is the only place that links a vendor to a material

**Why:** an MPN is "this material, from this vendor, at this price / MOQ / UOM". Linking anywhere else creates links without a price.

| Screen | Today | After |
|---|---|---|
| Material → New | "First vendor (optional)" | **Removed.** A hint says: "Add vendors and prices in MPNs". Finished / semi-finished goods still get their own MPN automatically (no vendor, made in-house) |
| Vendor → New / Edit | "Supplied materials" multi-select | **Removed from the form.** |
| Vendor → View | Supplied materials (manual list) | **Materials supplied (from MPNs)**: MPN, material, UOM, MOQ, price, lead time, preferred. Button **Add MPN for this vendor** (opens MPN form with the vendor filled) |
| Material → View | "Supplied by" from the manual list | Built from MPNs (vendor, price, MOQ, preferred) |
| Vendors list | "Materials" count from manual list | Count from MPNs |
| Bulk vendor template | "Supplied Material Codes" column | **Removed**; use MPN Bulk Entry / Bulk MPN Create for vendor + price |
| MPN form | Vendors who supply the material listed first | Same, but "supplier" now means "already has an MPN for it" |

**Old data is kept:** existing manual links without an MPN are listed on the vendor page under **"Linked without MPN (add price)"**, each with a **Create MPN** button. Nothing is deleted; no new manual links are made.

---

## 3. Phase B: Inward fills itself

New order of the form: **Material → MPN → quantity**. Everything else is suggested and can still be changed.

| Field | Filled from |
|---|---|
| Material | You pick it (search by code or name) |
| MPN | The material's MPNs; if there is only one, it is chosen automatically; preferred vendor's MPN first |
| Vendor | MPN's preferred vendor (list shows only that MPN's vendors) |
| UOM, MOQ, price (shown) | MPN / material |
| Location / WH | 1) top selector, if set · 2) where this material was last received · 3) the location's default WH. Always editable |
| Lot No | Suggested `<material code>-<YYMMDD>-<n>` (e.g. `RM-RICE-260924-1`); you can type the vendor's lot instead |
| Mfg / Expiry | Mfg = today; Expiry = Mfg + material shelf life |
| Reason | Dropdown: Goods receipt (default), Opening stock, Return from production, Other + note |

Example: pick **RM-RICE Rice Flour** → MPN-RICE-AG, Agro Grains Co, kg, MUM / WH-01 (last received there), lot `RM-RICE-260924-1`, expiry 23-03-2027. You type **150** and Save.

## 4. Phase C: Outward fills itself

| Field | Behaviour |
|---|---|
| Material | You pick it |
| Lots | From **every location / WH** you can see (top selector narrows it; "All locations" shows all), earliest expiry first (FEFO). Columns: Location / WH, lot, qty, UOM, expiry. Expired lots shown greyed and blocked |
| Location / WH | Filled from the lot you pick (no separate selection needed) |
| Quantity | Shows "max" = lot balance |
| Reason | Dropdown: Production issue, Sample / QC, Damaged, Expired disposal, Sale / dispatch, Other + note |

Example: pick **RM-RICE** with "All locations" → lots RICE-L2 (MUM / WH-01, exp 01-03-2027), RICE-L1 … → first valid lot is selected → type 5 → reason Sample / QC → Remove.

## 4a. Phase E: new records on top

Applies to Materials, Products, Vendors, MPNs, BOMs (lists) and Settings → Categories / Locations (badge only).

| What | How it looks |
|---|---|
| Newest first | Lists open sorted by **date added, newest first**. Clicking a column header still sorts by that column; clicking **Newest first** at the top right goes back |
| NEW tag | Records added today show a small **NEW** tag next to their code and a light blue row |
| Top-right counter | Next to the record count at the top right of each list: **"2 added today"**. Click it to show only today's additions; click again to show all |
| Save message | The "Material M1012 created" message moves to the **top right** of the screen |

Example: you bulk-upload 10 materials → the list opens with those 10 at the top, each tagged NEW, and the top right says "10 added today".

---

## 5. Decisions (defaults; change if you want)

1. Manual vendor ↔ material links stop; old ones stay visible with a Create MPN button (not auto-converted, because they have no price).
2. Lot number is suggested, not forced (vendors often print their own lot numbers).
3. Location suggestion for Inward uses "last received here" before the location's default WH.
4. "Top right" is read as: newest records at the top of each list + an "added today" counter at the top right of the list + the save message at the top right of the screen.

## 6. Session log

- 2026-09-24: Findings checked against the code (§1). Plan written.
- 2026-09-24: Request added: new records on top with a top-right counter (Phase E). Plan approved; build started on `feat/v6-mpn-inward`.
- 2026-09-24: A–E built (no database migration needed).
  - Backend: vendor "materials" and material "supplied by" come from MPNs; vendor `unpriced_links` lists old manual links; `material_ids` on vendors and the bulk "Supplied Material Codes" column are no longer used; `GET /api/inventory/inward-defaults` (last-received location / WH, next lot no); products return `created_at`; warehouses return `created_at`.
  - Frontend: Material form without vendor; Vendor form without supplied materials; vendor page lists MPNs + "Linked without MPN" with Create MPN; `/masters/mpns?new=1&vendor_id=&material_id=` opens a pre-filled MPN; Inward by material with suggestions; Outward lots from all locations with Location / WH column; reason dropdowns; DataTable `newField` (newest first, NEW tag, "N added today" filter, "Newest first" reset); Added column on Materials, Products, Vendors, MPNs, BOMs; NEW tag on Categories, Locations, Warehouses; save message top right.
  - Tests: 56 earlier (2 vendor tests updated to the new rule) + 3 new = 59 passing.
