# VMS ERP v8: Inward Entry Type, No MPN for Finished Goods, Plan Location from BOM

Owner: Shaik Saifulla · Written: 2026-09-24 · Base: v7 (`feat/v7-quick-categories`) · Branch: `feat/v8-entry-type` · Status: **approved 2026-09-24, in progress**

## 0. Tracker

| Phase | Scope | Status |
|---|---|---|
| A | Inward **Entry Type**: Opening Stock · Adjustment · Purchase (any material except finished goods) | Pending |
| B | Finished goods have **no MPN** anywhere in the screens; they only enter stock by Opening Stock, Adjustment or a batch | Pending |
| C | New Plan (and Batch Entry): choosing the product fills the **manufacturing location** from its active BOM | Pending |
| D | Verify: old tests pass, new tests, UI walkthrough, bundle for push | Pending |

Rule: nothing existing is removed or broken; old stock, ledger rows and batches keep working. No database change is needed.

---

## 1. Your request, line by line

| # | What you said | What it means |
|---|---|---|
| 1 | Add "Entry Type": Opening Stock, Adjustment, Purchase (raw materials only) | Inward asks **why** stock is coming in. The choice is saved in the audit ledger as its own transaction type |
| 2 | Restrict FG based on type | A finished good can never be **purchased**. It comes in only as Opening Stock, an Adjustment, or from a production batch |
| 3 | In MPN, finished products should not come: FINISHED GOOD → No MPN | MPN = something you **buy** from a vendor. Finished goods are made, so they disappear from the MPN list, MPN forms, MPN bulk files and MPN pickers |
| 4 | In a plan, selecting the finished product should fetch the manufacturing location by itself | The location is taken from where the product has an **active BOM** |

---

## 2. Phase A: Entry Type on Inward

| Entry Type | Who | Allowed materials | Ledger type | Notes |
|---|---|---|---|---|
| **Purchase** (default) | Editor, Admin | **Any material except Finished Good** (Raw Material, Packaging, Consumable, Semi-Finished) | INWARD, reference "PURCHASE" | Vendor from the MPN; Reference = GRN / invoice no |
| **Opening Stock** | Editor, Admin | All, including finished / semi-finished | OPENING | For go-live balances and first-time loading |
| **Adjustment** | **Admin only** | All | ADJUSTMENT | Reason required (e.g. "Found extra in store"). Same rule as today's Stock Adjustment |

- The form changes with the type:
  - **Purchase:** the material list shows every material except finished goods; MPN + vendor are required.
  - **Opening Stock / Adjustment:** any material. For finished goods the MPN field is hidden (see §3) and vendor is not asked.
- The old **Reason** list stays as a free note under the type (for example "GRN 4521 short-shipped").
- The **Transaction Report** shows the entry type, and you can filter by it.
- The API checks the same rules, so a wrong combination (e.g. Purchase of a finished good) is refused even outside the form.

Example: Entry Type **Purchase** → material RM-RICE → MPN-RICE-AG, Agro Grains → 150 kg → ledger "INWARD · PURCHASE · +150". Entry Type **Opening Stock** → FG-RL1 Rice O Lentil Pouch → 500 pcs, lot OPEN-FG-1 → ledger "OPENING · +500".

## 3. Phase B: finished goods have no MPN

**Why only on screen:** stock is stored per lot as MPN + Location + WH + Lot No (your master plan rule). Finished goods therefore keep a hidden **internal stock code** (the product code, e.g. FG-RL1) so their lots, batches and traceability keep working. Users never see or edit it as an MPN.

| Screen | Change |
|---|---|
| MPNs list, MPN export, MPN Bulk Update template | Finished / semi-finished goods removed |
| New MPN / Bulk MPN Create / MPN Bulk Entry | Material list shows every material except finished goods; a finished good is refused with "Finished goods are made, not bought: they have no MPN" |
| Material / Product view | "MPN" row hidden for finished goods; shows "Made in-house" |
| Inward | No MPN field for finished goods (internal code used automatically) |
| Stock, Stock Balance, Transactions, Traceability, Batch detail | MPN column shows **"–"** for finished-good lots (the product code and lot are already shown) |
| Outward, Transfers, Physical Count | Unchanged behaviour; MPN shown as "–" for finished goods |

Semi-finished goods are **not** affected: they can be purchased and keep their MPNs (decision 2).

## 4. Phase C: plan location from the BOM

On **New Plan**, when you pick the product:

| Product has active BOMs at… | What happens |
|---|---|
| **One** location | That location is filled in automatically ("from active BOM-1001 v1") |
| **Several** locations | The location list shows **only those**; the top-selector location is chosen if it is one of them, otherwise the first |
| **None** | Location stays empty with the message "No active BOM for this product. Create one first" and a **Create BOM** link |

- The location can still be changed, but only to locations that have an active BOM (others are greyed out with "no active BOM").
- **Batch Entry (ad hoc)** uses the same rule (decision 3).

Example: pick **FG-RL1 Rice O Lentil 100g Pouch** → Location = **MUM - Mumbai Plant** (BOM-1001 v1 is active only there) → enter 10 batches → Calculate.

---

## 5. Decisions (defaults; change if you want)

1. **Purchase** allows every material except Finished Good (your change, 2026-09-24).
2. Only **Finished Good** has no MPN; semi-finished goods keep MPNs and can be purchased (follows from 1).
3. **Batch Entry (ad hoc)** also takes its location from the active BOM.
4. The old instant **Stock Adjustment** on a lot stays; Inward "Adjustment" is for adding stock that has no lot yet.

## 6. Session log

- 2026-09-24: Request analysed; plan written.
- 2026-09-24: Changed on your request: Purchase = any material except finished goods (not raw materials only). Plan approved; build started.
