# VMS ERP v7: Add Missing Categories on the Spot, Collapsible Categories

Owner: Shaik Saifulla · Written: 2026-09-24 · Base: v6 (`feat/v6-mpn-inward`) · Branch: `feat/v7-quick-categories` · Status: **built, waiting for push**

## 0. Tracker

| Phase | Scope | Status |
|---|---|---|
| A | Bulk Entry / Bulk Update: one click creates the missing categories and sub-categories, then re-checks the file | Done |
| B | Material / Product form: "+ Add new category" and "+ Add new sub-category" inside the dropdowns | Done |
| C | Settings → Categories: collapsed by default, click a category to open its sub-categories | Done |
| D | Verify: old tests pass, new tests, UI walkthrough, bundle for push | Verified (64/64 tests, screens checked). Waiting for you to push `feat/v7-quick-categories` |

Rule: nothing existing is removed or broken. No database change is needed (the category tables from v5 are reused).

---

## 1. Your request, line by line

| # | What you said | What it means |
|---|---|---|
| 1 | Bulk entry with a new category / sub-category throws an error, so I must go to Categories, add it, and upload again | Today every row with an unknown category is an error; you leave the upload to fix it |
| 2 | Give a short, simple option: press it and the new category / sub-category is added | A button in the upload check: **Create missing categories**. It adds them to Settings → Categories and the rows become ready |
| 3 | "…and it will be in Master Data too" | New categories appear at once in the Material form, Material filters, Products and the bulk template dropdowns |
| 4 | "…add to classification or sub-category and category" | New **categories** and **sub-categories** are created under the row's classification. **Classification itself stays a fixed list** (Raw Material, Packaging, Consumable, Semi-Finished, Finished Good) because the system's rules depend on it: finished / semi-finished goods get BOMs and their own MPN, planning and batches use them. See decision 1 |
| 5 | Categories in Settings should not be expanded; when I click one it should expand | Categories list opens collapsed; a click (or the arrow) shows its sub-categories |

---

## 2. Phase A: Bulk Entry creates missing categories

**How it looks (after Check file):**

```
10 rows · 6 ready · 4 need new categories · 0 other errors

 New categories found in your file                                   [ Create 2 categories, 3 sub-categories ]
   Raw Material  →  Grains (new)  →  Rice (new), Wheat (new)
   Packaging     →  Primary Packaging (exists)  →  Jute Bags (new)
   Similar names already exist: "Grains" ≈ "Grains & Pulses". Fix the file instead if you meant that one.
```

1. Rows whose **only** problem is a missing category / sub-category are marked **Needs new category** (not a red error).
2. One button creates everything listed, in one save (all or nothing), under the classification written in each row.
3. The file is **checked again automatically**; those rows turn **Ready**. Then you press **Save** as usual.
4. Nothing is created unless you press the button. Editors and Admins can use it; Viewers cannot.
5. **Safety:**
   - A category that already exists under **another** classification is still an error (it is not duplicated), with the valid choices listed.
   - Names are matched ignoring case and extra spaces ("rice" = "Rice"). A near-match ("Grains" vs "Grains & Pulses") is shown as a hint so you don't create a duplicate by mistake.
   - Rows with other errors (bad UOM, duplicate name…) stay errors as today.
6. The same works in **Bulk Update**.

## 3. Phase B: add a category from the Material form

- **Category** dropdown ends with **"+ Add new category…"**, and **Sub-category** ends with **"+ Add new sub-category…"**.
- Choosing it shows one small text box with **Add** / **Cancel** under the dropdown. The new category is created under the **classification selected in the form** (sub-category under the selected category) and is selected at once.
- Works the same in Products → New Product (same form).
- Example: New Material → Classification *Raw Material* → Category *+ Add new category…* → type "Millets" → Add → *Millets* is selected; Sub-category *+ Add new sub-category…* → "Ragi" → Add.

## 4. Phase C: Settings → Categories collapsed

- Each category is one row: **▸ Grains & Pulses · Raw Material · 4 sub-categories · 12 materials**.
- Click the row or the arrow to open it (▾) and see its sub-categories; click again to close.
- **Expand all / Collapse all** at the top right.
- A category you just added a sub-category to opens by itself, so you see the result.
- Classification tabs, NEW tags, edit, delete and "+ Sub-category" stay as they are.

---

## 5. Decisions (defaults; change if you want)

1. **Classification stays fixed** (5 values). New categories and sub-categories can be created anywhere; a new classification would change how BOMs, planning and batches behave, so it would be a separate, larger change if you ever need it.
2. Creating categories from Bulk Entry needs an explicit button press; it never happens silently.
3. Categories open collapsed every time you visit the page (no memory of what was open).

## 6. Session log

- 2026-09-24: Request analysed; plan written.
- 2026-09-24: Approved and built (no database change).
  - Backend: bulk validation collects `needs` per row and `missing_categories` per file (with similar-name hints); summary `needs_category`; `POST /api/categories/bulk-create` (find-or-create, all or nothing, Editors / Admins).
  - Found while testing with your 10-row file: the same new name ("Packaging") asked for under two classifications. The first row's classification wins; the other row gets a clear error instead of breaking the whole create.
  - Frontend: Bulk dialog panel "New categories found in your file" + Create button + automatic re-check; rows marked "Needs category"; Material / Product form "+ Add new category… / sub-category…"; Settings → Categories collapsed with arrows, sub-category count, Expand all / Collapse all.
  - Tests: 59 earlier + 5 new = 64 passing.
