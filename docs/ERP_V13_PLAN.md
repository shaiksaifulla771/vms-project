# ERP.Rorosaur v13: multiple BOMs per product (expand, create, manage)

Status: **DONE** (requested 2026-09-26: "one product can have multiple BOMs; clicking it has to expand the existing BOMs; there is an error in BOM expand and creation of multiple").
Design: `design-taste-frontend` skill, "redesign - preserve" mode. The Zoho-style look stays: white, grey borders, one blue accent, lucide icons, no motion, no em dashes.

## 1. What was checked (reproduced on the latest master, PR #15)

Test data: 1 product (FG-RL1) with 5 BOMs, set up like this:
- MUM: Standard (Default), Economy pack, Festival pack, all Active.
- MUM: Trial recipe, Draft.
- PUN: Pune standard (Default), Active.

| # | Finding | Result |
|---|---|---|
| F1 | Creating another BOM for a product that already has BOMs, via New BOM, Save & Activate | **Works**: BOM-1005 v4 created and active. The backend allows several active BOMs per product and location, with one Default per location. |
| F2 | BOM list: after **Newest first** (a link shown by default) or clicking any column header, the product groups disappear and nothing can be expanded any more. The broken state is remembered, so it stays broken when you come back. | **Bug** |
| F3 | BOM list: the default status filter is **Active**, so a BOM saved with **Save Draft** vanishes from the list. It looks as if creation failed. | **Bug** |
| F4 | BOM list: when a location is chosen in the top bar, the location filter has no "All locations" option. BOMs of the same product at other plants (e.g. PUN) cannot be seen from the BOM list. | **Bug** |
| F5 | BOM list rows have no actions. Set Default, Copy, Activate and Obsolete are only on the BOM page. | Gap |
| F6 | Products list: "Active BOMs" is plain text (`MUM v1, MUM v2, PUN v1`). You cannot click a product to see its BOMs. | Gap |
| F7 | New BOM form: it does not show the BOMs that already exist for that product and location, and it cannot make the new BOM the Default. | Gap |

## 2. Tasks

| # | Task | Implementation | Status |
|---|---|---|---|
| T1 | Groups never break | In the shared table: when a list is grouped, sorting a column sorts **inside** each product group, and the groups stay in product order. "Newest first" is hidden on grouped lists. New storage key, so an old broken sort is dropped. | Done |
| T2 | Drafts stay visible | BOM status filter: **Active + Draft** (default), Active, Draft, Obsolete, All. The group header shows counts, e.g. "3 active, 1 draft". | Done |
| T3 | All locations | The location filter gets **All locations** alongside "Location from top bar" and each plant. | Done |
| T4 | Product group header | Click to expand or collapse (as in v12). The right side shows the **Default per location** (`MUM: BOM-1001 · PUN: BOM-1004`) and a **+ Add BOM** button, which opens New BOM with the product and location pre-filled. | Done |
| T5 | ⋯ menu on each BOM row | Open, Edit (draft), Activate (draft), Set as Default (active, not default), Copy as new BOM (to any location, with a name), Mark obsolete (asks to confirm). | Done |
| T6 | Products list: expandable rows | A ▸ on each product. Clicking it opens that product's BOMs (all locations; active and draft) right under the row: BOM, name, location, version, output, cost / unit, status, Default tag, and the same ⋯ menu, plus **+ Add BOM**. | Done |
| T7 | New BOM form: existing BOMs | Once the product and location are chosen, a panel lists the BOMs that already exist there (Default marked, links open in a new tab) and says "This will be version N". | Done |
| T8 | Make Default on save | A checkbox on New BOM and Edit BOM: **Make this the Default BOM at MUM**. It is applied in the same database transaction as activation. The first active BOM at a location is always the Default. | Done |
| T9 | Tests and checks | Backend tests: create with `make_default`, activate with `make_default`, and several BOMs per location with exactly one Default. Plus `npm run check`, a browser walkthrough, and screenshots in `docs/v13/`. | Done |

## 3. Not changed
- Active BOMs still cannot be edited in place: Copy, then edit the draft, then Activate. This keeps plans and batches tied to the exact recipe they used.
- Plans and batch entry still use the Default BOM unless another is chosen (v10 behaviour).

## 4. Session log
- 2026-09-26: F1 to F7 checked with a script against a local copy of the app. Plan written. Build started on `feat/v13-bom-multi`.
- 2026-09-26: **Built.**
  - **Shared table:** grouped lists sort inside groups. There are new group-header actions, and expandable rows (their open state is remembered on Back). Group headers and expanded panels stay pinned to the visible width, so nothing is pushed off screen at 1366px.
  - **Shared BOM tools:** new `components/bomKit.jsx`, which the BOM list, the Products list and the New BOM form all use:
    - `useBomActions`: the ⋯ menu and its dialogs.
    - `ProductBoms`: a product's BOMs shown under the product row.
    - `ExistingBoms`: the panel on New BOM.
  - **BOM list:**
    - Status filter options "Active and draft" (default), Active, Draft, Obsolete, All.
    - "All locations" option in the location filter.
    - Group header shows counts plus the Default per location, with "+ Add BOM".
    - ⋯ menu per row.
    - The Type column is off the screen but still printed.
  - **Products list:** ▸ expands a product's BOMs, with ⋯ actions and "+ Add BOM".
  - **New / Edit BOM:** an "Already at MUM" panel with the next version number, and the "Make this the Default BOM" checkbox. The backend applies `make_default` on create and on activate in the same transaction.
  - **Checks:**
    - `npm run check`: lint, build and 145 backend tests all pass (`tests/v13.test.js` adds 5).
    - New v13 browser walkthrough, plus the earlier v9, e2e, v10pdf and v12 scripts: no errors.
