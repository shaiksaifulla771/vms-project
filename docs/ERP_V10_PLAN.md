# ERP.Rorosaur v10: Multiple BOMs, Location-first Planning, HSN, Full-page Views, Printing

Owner: Shaik Saifulla · Written: 2026-09-25 · Base: master + v9 package upgrade (`feat/v9-clean-deps`) · Branch: `feat/v10-bom-print` · Status: **waiting for approval**

## 0. Tracker

| Phase | Scope | Status |
|---|---|---|
| A | **Multiple BOMs** per product and location, one marked Default | Pending |
| B | **Plan and Batch Entry start from the location**: choose location, then only its products and BOMs are listed | Pending |
| C | **Semi-finished goods in BOMs**: as a BOM product and as an ingredient (even without an MPN) | Pending |
| D | **Finished goods through Inward** again (Opening Stock / Adjustment) | Pending |
| E | **Vendor**: remove the address "Type" (Primary / Secondary) option | Pending |
| F | **HSN code on MPN** (form, list, view, bulk files) | Pending |
| G | **Full-page view**: clicking a record opens one page with everything about it | Pending |
| H | **Printing**: print all, or only a date range / selection, from every report and list | Pending |
| I | Verify: old tests pass, new tests, UI walkthrough, bundle for push | Pending |

Rules: nothing existing is removed or broken; old BOMs, plans, batches and stock keep working. Database changes are additive only (one migration).

---

## 1. Your request, line by line

| # | What you said | What it means |
|---|---|---|
| 1 | Today it is one-to-one BOM; I need to access and create multiple BOMs | A product can have **several active BOMs** at the same location (e.g. "Standard", "Economy pack"). Today only one can be active, so a second one forces the first to stop |
| 2 | FG product can be added in inventory through Inward | Finished goods come back in the Inward form (Opening Stock / Adjustment), still with no MPN shown |
| 3 | Remove the type option from Vendor | The vendor address **Type (Primary / Secondary)** dropdown goes away; the **Default** tick stays |
| 4 | Add HSN in MPN | New **HSN Code** field on every MPN |
| 5 | When user or admin clicks, a full screen should show, so everything is seen in one view | Clicking a Material, Product, MPN, Vendor, BOM, Plan or Batch opens a **full page** (not a small pop-up) with all its details on one screen |
| 6 | Print all stock, required stock, balance sheet or any transaction: all, or by date / selection | One **Print** button on every report and list, with "All" or "Only what I select" (date range, location, material, type) |
| 7 | In the BOM, semi-finished products have to be listed | Semi-finished goods can have their own BOM **and** be used as an ingredient in a finished good's BOM |
| 8 | In Plan, don't fetch the location from the product; pick the location and list the plans / BOMs for it | **Location first**: after choosing the location, only products with a BOM there are listed, then their BOMs |

---

## 2. Phase A: multiple BOMs

| Today | After v10 |
|---|---|
| One **active** BOM per product per location | **Many active BOMs** per product per location |
| New version replaces the old one | Each BOM has a **name** (e.g. "Standard 100g", "Economy 1kg") and can live side by side |
| Plan uses "the" active BOM | One BOM is marked **Default**; plans and batches pick the default but you can choose another |

Screens:
- **BOMs list**: grouped by product → every BOM with name, version, location, status, Default tag, cost per unit. Filters: product, location, classification (Finished / Semi-finished), status.
- **New BOM**: "New BOM" from the list or from a product; **Copy** button on any BOM to start a new one from it.
- **Set as Default** action (one default per product + location).
- Old BOMs become "Default" automatically, so nothing changes for existing plans.

Example: FG-RL1 at MUM → BOM-1001 "Standard" (Default) and BOM-1004 "Economy pouch". New Plan for FG-RL1 at MUM offers both, with Standard pre-selected.

## 3. Phase B: plan and batch start from the location

New Plan (and Batch Entry, Ad Hoc):

1. **Location** first (pre-filled from the top bar, changeable).
2. **Product** list shows only products that have an active BOM at that location.
3. **BOM** list shows that product's BOMs at that location, with the Default pre-selected.
4. Batches / quantity → Calculate (same as today).

- No active BOMs at a location → message "No BOMs at MUM yet. Create BOM".
- **Plans list**: follows the top-bar location, with a Location filter, so choosing a location shows its plans.
- This replaces the v8 behaviour (product first → location filled from the BOM).

## 4. Phase C: semi-finished goods in BOMs

- **As a BOM product**: semi-finished goods (e.g. "Masala Premix") get their own BOMs, listed under the Semi-finished filter.
- **As an ingredient**: a finished good's BOM can use a semi-finished good. If it is made in-house (no MPN), the line is allowed without an MPN and its cost comes from its own BOM's cost per unit.
- **Planning**: the premix shows in the Material Summary with stock available and short / long, like any material. If short, the plan shows "Make Masala Premix first" with a link to plan it. (Nested automatic plans are **not** in v10; see decision 3.)
- **Batch Entry**: premix lots made by earlier batches can be selected and consumed; traceability links FG lot → premix lot → raw material lots.

## 5. Phase D: finished goods through Inward

- The Inward material list includes finished goods again for **Opening Stock** and **Adjustment**.
- MPN field shows "None (made in-house)", vendor disabled (same as v8).
- Still blocked: topping up a lot that came from a production batch (change it from the batch instead).
- Reverses the "no finished goods in Inward" rule from PR #11.

## 6. Phase E: vendor address Type removed

- The **Type** dropdown (Primary / Secondary) disappears from the vendor form, vendor view and vendor bulk files.
- The **Default** tick stays and decides which address is used.
- Existing data is kept in the database (not deleted), just no longer shown or asked.

## 7. Phase F: HSN code on MPN

- New **HSN Code** field on MPN: 4, 6 or 8 digits (checked on save).
- Shown in: MPN form, MPN list (new column), MPN full-page view, Inward (read-only next to the MPN), MPN Bulk Create / Bulk Update / Export files.
- Optional, so old MPNs keep working; the MPN list can filter "HSN missing".

## 8. Phase G: full-page view

Clicking a row (or the eye icon) opens **one page** with everything, and Edit on the same page:

| Record | One page shows |
|---|---|
| **Material** | Details · MPNs with vendors, prices and HSN · BOMs that use it · stock by location / warehouse / lot · last 20 transactions |
| **Product** (FG / SFG) | Details · all its BOMs (Default tagged) · stock lots · open plans · recent batches |
| **MPN** | Details, HSN · vendors with price, MOQ, lead time · price history · stock lots received on it |
| **Vendor** | Details, addresses, contacts, bank · MPNs supplied with prices · recent receipts |
| **BOM** | Header, all lines with cost · cost per unit · plans and batches using it · Copy / Set Default / Edit |
| **Plan / Batch** | Already full pages; tidied to the same layout |

- **Back** returns to the list with your filters and page kept.
- Pop-ups stay only for small actions (delete confirm, quick add).

## 9. Phase H: printing

One **Print** button on: Stock, Stock Balance Sheet, Physical Stock Sheet, Transaction Report, Reorder Alerts (**required stock**), Plan material requirement (**required stock for a plan**), BOM view, Batch view, and the Material / MPN / Vendor lists.

Print dialog (same everywhere):

| Option | Choices |
|---|---|
| What to print | **All** · **Current filter** (what is on screen) · **Selected rows** (tick boxes) |
| Date range | From – To (transactions, batches, plans) or **As on date** (stock, balance sheet) |
| Location / Warehouse | All or one |
| Material / MPN / Type | Optional filters |

Print layout: company name, report title, filters used, printed by, date and time, page numbers, column totals; A4 portrait or landscape (auto for wide reports); no buttons or sidebar on paper. Use the browser's **Print** or **Save as PDF**.

- **Who can print**: Admin, Editor and Viewer (printing never changes data).
- "As on date" stock is rebuilt from the audit ledger, so you can print the stock as it was on any past date.

---

## 10. Decisions (defaults; change any you want)

1. **Multiple BOMs** = several active BOMs per product at a location, with one **Default**. (Alternative: keep one active and only make old versions easier to reach.)
2. **Vendor "Type"** = the address Primary / Secondary dropdown. (Tell me if you meant something else.)
3. **Semi-finished in plans** is single level: the plan shows the premix need and shortage, and you plan the premix separately. Automatic nested plans can come later.
4. **Printing** = browser print / Save as PDF with the layout above. CSV export stays as it is.
5. **Location first** applies to both New Plan and Batch Entry (Ad Hoc).
6. **HSN** is optional (not required) so existing MPNs are not blocked.

## 11. Session log

- 2026-09-25: Request analysed; plan written. Waiting for approval.
