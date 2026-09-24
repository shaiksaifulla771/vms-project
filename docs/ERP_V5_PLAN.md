# VMS ERP v5: Dropdown Options for Master Data (Classification → Category → Sub-category, UOM) and a Products Sub-module

Owner: Shaik Saifulla · Written: 2026-09-24 · Base: v4 (`feat/v4-count-plans`) · Branch: `feat/v5-master-options` · Status: **built, waiting for push**

## 0. Tracker

| Phase | Scope | Status |
|---|---|---|
| A | Categories belong to a classification; starter category list | Done |
| B | UOM master list (Settings → UOMs); UOM dropdowns everywhere | Done |
| C | Material form + list: dependent dropdowns | Done |
| D | Bulk entry / update: dropdowns inside the Excel template, clearer errors | Done |
| E | MPN, BOM and Vendor forms use the same option lists | Done |
| F | Products sub-module under Master Data | Done |
| H | Locations & Warehouses move from Master Data to Settings | Done |
| G | Verify: old tests pass, new tests, UI walkthrough, bundle for push | Verified (55/55 tests, pages checked). Waiting for you to push `feat/v5-master-options` |

Rule for every phase: **nothing existing is removed or broken.** Database changes are additive (migration 008). Existing materials, categories and UOM values stay as they are. All 43 current tests must keep passing.

---

## 1. What you asked, line by line

| # | What you said | What it means for the build |
|---|---|---|
| 1 | Bulk entry failed: "Category 'Grains' does not exist" on every row | Categories were free text that had to match Settings → Categories exactly, and the template gave no list to pick from. |
| 2 | "Category and sub-category have to be list options depending on the classification selected" | Each category belongs to one classification. Choosing *Raw Material* shows only raw-material categories; choosing a category shows only its sub-categories. |
| 3 | "UOM too has to be a list of options" | A managed UOM list (kg, g, ltr, ml, pcs, box, carton, roll ...). Every UOM field becomes a dropdown. |
| 4 | "Check material, vendor, MPN and BOM, because different sub-modules have different options and functions" | Review each form and replace free-text fields that should be choices (§5). |
| 5 | "I can't see clearly the sub-module of Product" | Today products are hidden inside Material Master as *Finished Good* rows. Add **Master Data → Products** (§6). |
| 6 | "The Location and Warehouse should be in Settings" (added 2026-09-24) | Locations & WH is company set-up, not day-to-day master data. Move it to **Settings → Locations & WH** (§6a). |
| 7 | "Make a plan, add it to instructions, then work on it" | This file (repo `docs/` + project doc `claude/ERP_V5_PLAN.md`). Build follows it. |

---

## 2. Phase A: categories per classification

- `material_categories` gets a `classification` column (top-level categories only; sub-categories inherit from their parent).
- **Existing categories are not lost.** Migration 008 sets each existing category's classification automatically when all materials using it share one classification. Anything left blank shows as *All classifications* and can still be used by any material until an Admin assigns one.
- A material's category must match its classification (enforced in the database, so the form, API and bulk upload all obey it). Changing a material's classification clears a category that no longer fits.
- **Starter list** (added only if the name does not already exist; edit or deactivate any of them in Settings → Categories):

| Classification | Category → Sub-categories |
|---|---|
| Raw Material | Grains & Pulses → Rice, Lentils & Dals, Millets, Flours · Spices & Seasoning → Whole Spices, Ground Spices, Salt, Spice Blends · Oils & Fats → Edible Oils, Ghee & Butter · Dairy → Milk Powder, Milk Solids · Sweeteners → Sugar, Jaggery · Food Additives → Preservatives, Colours, Flavours |
| Packaging | Primary Packaging → Pouches, Laminate Film, Bottles & Jars, Labels · Secondary Packaging → Cartons, Shrink Wrap · Tertiary Packaging → Pallets, Stretch Film |
| Consumable | Packing Consumables → Tapes, Strapping · Cleaning & Hygiene → Detergents, Sanitizers · Lab & QC → Reagents, Test Kits · Maintenance → Spares, Lubricants |
| Semi-Finished | Premixes → Dry Premix, Wet Premix · Intermediates → Blends, Slurries |
| Finished Good | Ready-to-Cook Mixes → Rice Mixes, Breakfast Mixes · Ready-to-Eat → Snacks, Meals · Spices & Masalas → Blended Masalas, Pure Spices |

- Settings → Categories: grouped by classification, classification chosen when creating a category, filter by classification.

## 3. Phase B: UOM master

- New table `uoms` (code, name, type: Weight / Volume / Count / Length / Other, decimals allowed yes/no, status).
- Starter list: kg, g, mg, ton, ltr, ml, pcs, nos, box, carton, pack, bag, roll, dozen, m, cm.
- **Existing values are kept**: every UOM already used in materials, MPNs or BOMs is added to the list as-is, so no old record breaks.
- Typing "KG" or "Kg" is matched to "kg" (case-insensitive). Unknown UOMs are rejected with the list of valid ones.
- Settings → UOMs: add, edit, deactivate (inactive = not offered for new records, old records keep it).

## 4. Phase C/D: Material form and bulk upload

- **Form**: Classification → Category (only that classification's categories) → Sub-category (only that category's) → Base UOM (dropdown grouped by type). Link "Manage categories" for Admins/Editors.
- **List filters**: the category filter narrows to the chosen classification.
- **Bulk template (Excel)**: real dropdowns in the cells for Classification, Category, Sub-category, UOM and Status (from a *Lists* sheet), plus a *Categories* sheet showing Classification → Category → Sub-categories. Errors name the valid choices, for example: *Category "Grains" is not a Raw Material category. Choose one of: Grains & Pulses, Spices & Seasoning, ...*
- Same for bulk update and for MPN bulk templates (UOM dropdown).

## 5. Phase E: other forms

| Screen | Change |
|---|---|
| MPN form, Bulk MPN Create | Vendor UOM is a dropdown (blank = material UOM) |
| BOM edit | Batch UOM and Output UOM are dropdowns; Output UOM defaults to the product's UOM; Product list shows only Finished / Semi-Finished goods |
| Vendor form | State is a dropdown of Indian states / UTs when Country is India (free text for other countries); Country is a dropdown with India first |
| Material bulk / vendor bulk | Same option lists and validation as the forms |

## 6. Phase F: Products sub-module

Master Data → **Products** (after Materials). Products are the Finished and Semi-Finished materials; no duplicate data is stored.

| Column | Meaning |
|---|---|
| Code, Product name, Type (FG / SFG), Category, UOM, Shelf life, Status | From Material Master |
| Active BOMs | Count and locations with an active BOM (e.g. "MUM v1") |
| Batch → Output | Batch size and expected output of the active BOM in the selected location |
| Cost / unit | From the active BOM's costing |
| Stock | Current finished-goods stock in the selected location / WH |
| Open plans | Plans not yet completed |

Actions: **New Product** (material form preset to Finished Good), **View** (details, BOM versions per location, MPN, stock, open plans), **Create BOM** (opens BOM editor with the product chosen), Edit, Delete (same rules as materials).

## 6a. Phase H: Locations & Warehouses in Settings

- Menu: **Settings → General · Locations & WH · Categories · UOMs**. It is removed from Master Data.
- New address `/settings/locations`; the old `/masters/locations` link redirects there, so bookmarks keep working.
- The page itself and its rules are unchanged (locations, warehouses, default WH). The global Location / WH selector at the top stays where it is.

---

## 7. Decisions taken (defaults, change any time)

1. A category belongs to **one** classification; sub-categories follow their parent.
2. Old categories without a classification stay usable by all classifications until assigned.
3. The starter category and UOM lists are added automatically; nothing existing is renamed.
4. UOM values in old records are never rewritten.
5. Products is a view over Material Master, not a separate table, so a product can never go out of sync.

## 8. Session log

- 2026-09-24: Request analysed (bulk upload errors screenshot). Plan written and saved. Build started on `feat/v5-master-options`.
- 2026-09-24: Request added: Locations & WH move to Settings (Phase H).
- 2026-09-24: A–H built. Migration `008_master_options.sql` (additive) applies automatically on the first backend start.
  - Backend: `uoms` table + `erp.check_uom()` triggers on materials / MPN vendors / BOMs / BOM lines; `material_categories.classification`
    (sub-categories follow the parent; a material's category must match its classification); starter categories and UOMs;
    existing categories auto-assigned where all their materials agree; routes `/api/uoms`, `/api/products`, categories `?classification=`.
  - Bulk: errors name the valid choices; the Excel template has dropdowns (Classification, dependent Category / Sub-category, UOM,
    vendor State) fed from a hidden Lists sheet, plus a Categories reference sheet. Formulas checked in LibreOffice.
  - Frontend: Material form/list dependent dropdowns; Settings → Categories grouped by classification; Settings → UOMs;
    UOM dropdowns on MPN, Bulk MPN Create and BOM; vendor State / Country dropdowns; Master Data → Products (view, Create BOM);
    Locations & WH under Settings (old link redirects).
  - Tests: 43 earlier + 12 new = 55 passing.
