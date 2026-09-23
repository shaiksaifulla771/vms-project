# VMS ERP v4: Scrollbars, Physical Stock Count and Batch-Count Plans

Owner: Shaik Saifulla · Written: 2026-09-23 · Base: v3 (`feat/v3-master-data`) · Status: **built, waiting for push**

## 0. Tracker

| Phase | Scope | Status |
|---|---|---|
| A | Scrollbars for wide and long tables (Transactions first) | Done |
| B | Physical Stock Count: a controlled counting process instead of instant adjustments | Done |
| C | Plans defined by number of batches, editable, remaining recalculated | Done |
| D | Verify: old tests pass, new tests, UI walkthrough, bundle for push | Verified (43/43 tests, all 21 pages load). Waiting for you to push `feat/v4-count-plans` |

Rule for every phase: **nothing existing is removed or broken.** The database changes only add things (migration 007), and all 33 current tests must keep passing.

---

## 1. Your request, line by line

| # | What you said | What it means for the build |
|---|---|---|
| 1 | "Add a sliding bar for down wherever it's required, I think in Transactions" | Long or wide tables such as the Transaction Report need a scrollbar you can always reach. Today the sideways scrollbar sits at the very bottom of the table, so you have to scroll all the way down to find it. |
| 2 | "Physical stock sheet… when I enter a number it directly removes data, not asking the reason" | Today, typing a count and pressing Post changes stock immediately with the fixed reason "Physical stock count". There is no per-line reason, no review and no record of the count. |
| 3 | "I can directly do it in stock adjustment, what is the use of physical stock sheet?" | The two screens currently do the same thing. The stock sheet needs its own purpose. |
| 4 | "Don't delete it, make it useful, how it has to work" | Keep the page and turn it into a proper **stock count** process (§3). |
| 5 | "In plan it has to ask how many plans (batches) to create… 10, 1 executed, 9 remaining" | A plan is entered as a **number of batches**. Executing one batch leaves 9. |
| 6 | "It can be edited when the number is increased or decreased, the values have to change" | Editing the batch count recalculates remaining batches, remaining quantity and the material requirement and shortages for what's left. |
| 7 | "Don't break any existing features" | Additive changes only. The old quantity-based plans keep working. |
| 8 | "Add to memory; once I approve your plan you can proceed" | This plan is saved to the project and memory. **No code until you approve.** |

---

## 2. Phase A: scrollbars

- Wide or long tables (Transactions, Stock, Stock Balance, Physical Count, Plans, Batches, Materials, MPNs) sit in a **scroll box as tall as the screen**:
  - the column headers stay fixed while you scroll down;
  - the sideways scrollbar is always visible at the bottom of the screen;
  - the page itself no longer grows endlessly.
- The Transaction Report also gets **paging** (100 rows per page, with a record count). The audit ledger grows forever, and loading everything at once gets slow.
- Printing is unaffected: printed pages show all rows with no scroll box.

---

## 3. Phase B: Physical Stock Count (replaces "type and post")

**Why it differs from Stock Adjustment**

| | Stock Adjustment | Physical Stock Count |
|---|---|---|
| Purpose | Fix one known mistake on one lot | Planned count of a whole warehouse (or part of it) |
| Who | Admin, alone | Store staff count, Admin approves (two people) |
| Stock changes | Immediately | Only after approval |
| Reasons | One reason | A reason for **every** line that differs |
| Record kept | One ledger row | A count document (CNT-000001) with counted by, approved by, every line and variance, printable before and after |

**How it works**

1. **Start a count.** Choose Location / WH and optionally a category or material type. The system takes a snapshot of every lot and its system quantity, then numbers the count (CNT-000001, status **Draft**).
2. **Print the sheet.** Lots are listed with blank Physical Qty boxes. An optional **blind count** hides the system quantity, so counters write down what they actually see.
3. **Enter counts** (status **Counting**). Type the physical quantity per lot. Variance and variance % show at once. You can save and continue later. Nothing changes stock yet.
4. **Reasons are required.** Any line with a variance needs a reason from a list (Damaged, Expired / discarded, Spillage / wastage, Counting error earlier, Theft / loss, Found extra, Other + note). You can't submit without them.
5. **Submit for approval** (status **Submitted**). Counts can no longer be edited, and the count shows totals: lines counted, lines with variance, total + / −.
6. **Approve or send back** (Admin).
   - **Approve**: one database transaction posts all adjustments, each linked in the audit ledger to the count number and the line's reason (status **Posted**).
   - **Send back**: returns to Counting with a comment.
   - **Safety check**: if stock moved on a lot after the snapshot (inward, outward or batch), approval warns you and shows the current quantity, so you don't overwrite real movements.
7. **History.** A list of all counts with status, who counted, who approved and total variance. Each count can be reopened and printed with its results. Counts can't be deleted once posted; a Draft can be cancelled.

The old "Post Adjustments" button goes away, because it bypassed the reasons. Stock Adjustment stays as it is for one-off corrections.

**New tables:** `stock_counts` (header) and `stock_count_lines` (lot, snapshot qty, counted qty, variance, reason, note). Posting uses the existing `erp.post_stock()` with reference type `STOCK_COUNT`.

---

## 4. Phase C: plans by number of batches

**Creating a plan**
- A choice: **Plan by** ◉ Number of batches ○ Quantity (the current way stays available).
- By batches: enter "10 batches". The system shows the planned output (10 × BOM expected output) and explodes the materials for 10 batches with shortages.

**Plan summary shows both measures**

| Planned batches | Executed batches | Remaining batches | Planned qty | Executed qty | Remaining qty | Status |
|---|---|---|---|---|---|---|
| 10 | 1 | 9 | 10,000 | 1,000 | 9,000 | In progress |

- Executed batches = batches submitted against this plan. It rises automatically after each Batch Entry.
- **Edit the batch count** (Admin, as today for target changes): 10 → 12 gives 11 remaining; 10 → 5 gives 4 remaining.
  - Materials, availability and shortages recalculate at once for the remaining batches only.
  - The edit is logged with old value, new value, who and when.
  - You can't reduce the count below the batches already executed.
- A plan is **Completed** when executed batches reach planned batches.
- Existing quantity-based plans are unchanged. For them, the batch figures are calculated as ceil(qty ÷ expected output).

---

## 5. Decisions (approved 2026-09-23)

1. "10 plans, 1 executed" means **10 production batches inside one plan**, not 10 separate plan documents.
2. Hiding the system quantity is **your choice on each count**: a "Hide system qty" tick box when starting a count, off by default.
3. **Only Admins** can approve a count and post the adjustments.

## 6. Session log

- 2026-09-23: Request analysed and this plan written. Waiting for approval before any code.
- 2026-09-23: Plan approved (v3 is merged to master as 9976447). Work started on branch `feat/v4-count-plans`.
- 2026-09-23: A–C built. Migration `007_stock_counts_batch_plans.sql` (additive) applies automatically on the first backend start.
  - Backend: `routes/stockCounts.js` (DRAFT → COUNTING → SUBMITTED → POSTED / CANCELLED; Admin approve and send back; moved-stock check), plans `plan_mode` + `target_batches` (status follows executed batches), `planning.refreshPlanStatus`, ledger `?page=` paging.
  - Frontend: DataTable fits the screen with sticky headers and always-visible scrollbars; Transactions has server paging and search; Inventory > Physical Stock Count (list + count page, print sheet, reasons, approve); New Plan "Plan by batches"; plan detail "Edit Number of Batches"; batch entry shows "batch X of N".
  - Bug fixed along the way: the New Plan preview disappeared when Create Plan was clicked straight after typing (the field lost focus and recalculated). The preview now stays until the new result arrives.
  - The old Physical Stock Sheet link now opens Physical Stock Count. Its instant "Post Adjustments" button is gone, because it skipped reasons and approval.
  - Tests: 33 earlier + 10 new = 43 passing.
