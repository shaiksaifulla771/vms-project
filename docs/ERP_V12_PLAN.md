# ERP.Rorosaur v12: module clean-up (select / print / download, one-line stock, BOM collapse, batch menu, vendor contact notes)

Status: **DONE** (approved 2026-09-26, built on `feat/v12-module-cleanup`).
Design direction: built with the `design-taste-frontend` skill in "redesign - preserve" mode. The existing Zoho-style look stays (white, grey borders, one blue accent, lucide icons). The work is dense data, not decoration: no motion, no new colours, and no em dashes in any label.

## 1. Request, split into tasks

| # | What you asked | Module / screen | How it will be done | Status |
|---|---|---|---|---|
| 1 | One **Select** option at the top of each list. Clicking it shows the tick boxes; the ticked rows can then be printed or downloaded. Less clutter on screen. | Every list page (shared table): Materials, Products, Vendors, MPNs, BOMs, Stock, Transfers, Stock Counts, Plans, Batches, Stock Balance, Physical Sheet, Transactions, Reorder | See 2.1 | Done |
| 2 | **Stock**: every row on one line, so the whole list fits the screen without scrolling sideways | Inventory > Stock | See 2.2 | Done |
| 3 | **BOM**: stop showing everything expanded. Click to expand, click again to collapse. | Masters > BOMs list (product groups) | See 2.3 | Done |
| 4 | **Batches**: a three-dots (⋯) menu that holds all the options | Manufacturing > Batches list and Batch page | See 2.4 | Done |
| 5 | **Vendor contact directory**: add a Notes box to each contact | Masters > Vendors (edit form and view page) | See 2.5 | Done |
| 6 | **Stock Count**: remove the 5 numbered step boxes ("1. Start a count ... 5. Admin approves") | Inventory > Physical Stock Count | See 2.6 | Done |

## 2. Implementation detail

### 2.1 Select mode on every list (shared `DataTable`)
- **Today:** a checkbox column shows on every list all the time. CSV always exports every row on screen, and Print sits beside it.
- **New:** the table toolbar gets one **Select** button.
  - While Select is off, there is no checkbox column, so the table is narrower and cleaner.
  - Clicking **Select** shows the checkbox column plus a slim action bar: `3 selected | Select all | Print | Download CSV | Cancel`.
  - **Print** opens the existing print dialog with "Selected rows" already chosen.
  - **Download CSV** exports only the ticked rows.
  - **Cancel** hides the checkboxes and clears the ticks.
- **Unchanged:** outside Select mode, Print (All / Current filter) and CSV (current view) work as they do now.
- The same component serves all 14 lists, so every module gets this at once.

### 2.2 Stock list on one line
The list currently has 13 columns, so it scrolls sideways and material names wrap. The new layout has 9 columns, never wraps, and fits a 1366px laptop screen without sideways scroll:

| New column | Built from |
|---|---|
| Material | material code and name on one line (long names cut with "..." and shown in full on hover) |
| MPN | MPN (FG shows "In-house") |
| Type | classification, short form (RM, PKG, SFG, FG, CON) |
| Lot | lot no |
| Loc / WH | `MUM / WH-01` |
| Qty | quantity + unit, right-aligned (`10,000 kg`) |
| Mfg | date |
| Expiry | date, red when expired |
| ⋯ | Outward, Transfer, Adjust, Trace lot (menu instead of three text links) |

- Vendor moves out of the table: it is shown on hover and on the lot trace page, and it stays in CSV, Print and the print filters. **Nothing is lost from exports.**
- Cells keep `white-space: nowrap`. Row height stays compact.

### 2.3 BOM list: collapsible product groups
- Each product is one header row: product, number of BOMs, Default BOM and its cost / unit, and a ▸ / ▾ toggle.
- Groups start **collapsed**. A click expands the group; a second click collapses it.
- **Expand all / Collapse all** link in the toolbar.
- Searching or filtering expands the groups that match automatically.
- The open / closed state is remembered when you go into a BOM and press Back.
- Printing is not affected: it always prints all lines.

### 2.4 Batches: three-dots menu
- **Batches list:** a ⋯ button at the end of each row, with View, Open plan (if from a plan), Trace lot, Print, Edit IP / OP, and Reverse batch (Admin). Items you are not allowed to use are hidden.
- **Batch page:** the header keeps **Back** and the primary **Edit IP / OP**. Print, Open plan, Trace lot and Reverse batch move into one ⋯ menu.
- The menu is keyboard accessible: it opens with Enter, closes with Esc, and closes on an outside click.
- It is a shared `Menu` component, so the Stock row actions (2.2) use the same one.

### 2.5 Vendor contact notes
- **Database:** migration `014_vendor_contact_notes.sql` adds `notes text` to `vendor_contacts` (max 1,000 characters, validated in the API).
- **API:** the vendor save stores notes. Vendor view, export and bulk import include them.
- **Edit form:** a Notes box on each contact row (single line, expands when focused).
- **View page:** a Notes column in the contact directory.
- **Tests:** notes save and read back, a too-long note is refused, and existing contacts are unaffected.

### 2.6 Physical Stock Count clean-up
- The 5 numbered step boxes are removed.
- The long page subtitle becomes one short line: "Count stock, explain differences, Admin approves before stock changes."
- The count workflow itself does not change.

## 3. Checks before delivery
- `npm run check` (lint, build, all backend tests), plus new tests for 2.5.
- Browser walkthrough of every list, covering:
  - Select on/off, print selected, CSV selected.
  - Stock at 1366px and 1440px, with no sideways scroll and no wrapped rows.
  - BOM expand / collapse / remembered.
  - Batch ⋯ menus as Admin and Editor.
  - Vendor notes save and show.
  - Stock count page.
- Before / after screenshots in `docs/v12/`.

## 4. Assumptions (tell me if any is wrong)
1. "BOM all expanded" means the **BOM list page** (product groups), not the lines inside one BOM.
2. The Select mode applies to **all lists**, not only Stock.
3. On the Stock list, Vendor can leave the on-screen table (it stays in hover, CSV and Print) to make room for one line.

## 5. Session log
- 2026-09-26: request analysed against the code (DataTable, StockPage, BomsPage, BatchesPage, BatchDetailPage, VendorFormPage / VendorViewPage, masterData service, StockCountsPage). Plan written.
- 2026-09-26: **Approved and built.**
  - **Select mode:** in the shared table, plus the Stock Balance page (its own layout).
    - Tick boxes appear only after **Select**.
    - The selection bar offers Print (the dialog opens on "Selected rows"), Download CSV (ticked rows only) and Cancel.
  - **Stock:** 9 compact columns on one line.
    - Measured: no sideways scroll at 1280, 1366 and 1440px, and every row is one line.
    - Print and CSV still carry all 12 detail fields, via new `hidden: true` columns that are printed but not shown on screen.
  - **Row actions:**
    - Row actions sit in a ⋯ `ActionMenu`: keyboard arrows, Esc and outside click all work, and the menu follows the button when the table scrolls.
    - Row-action columns are pinned to the right edge, so ⋯ is reachable without scrolling sideways. This also applies to the master lists.
  - **BOM list:**
    - Product groups start collapsed and open or close with a click.
    - Expand all / Collapse all.
    - The open groups are remembered on Back, and a search shows every matching group.
    - Each group header shows its Default BOM and cost per unit.
  - **Batches:**
    - The list has a ⋯ per row: View, Open plan, Trace lot, Print, Edit IP / OP, Reverse. Items are hidden by role and by status (reversed batches).
    - The batch page keeps Back and Edit IP / OP; Print, Open plan, Trace lot and Reverse sit in ⋯.
  - **Vendor contact notes:**
    - Migration `014_vendor_contact_notes.sql`, with a 1,000-character limit.
    - Validated in the API, included in bulk import, and shown on the edit form and the view page.
    - Tests: `backend/tests/v12.test.js`.
  - **Stock Count:** the 5 step boxes are removed and the subtitle is one short line.
  - **Small clean-ups:**
    - Empty-value dash is now a plain hyphen.
    - The Stock footnote uses readable contrast.
  - **Checks:**
    - `npm run check`: lint, build and 140 backend tests all pass.
    - Browser walkthrough as Admin and Editor, plus the earlier v9, e2e and PDF print scripts, with no errors.
  - Screenshots are in `docs/v12/`.
