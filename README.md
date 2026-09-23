# ERP - Inventory, Planning, Manufacturing

A stateful, database-driven, Zoho-style ERP. React (Vite, Tailwind) + Express REST API + PostgreSQL (Supabase).
No login: every request runs as an "acting user" chosen in the top bar.

```
Master Data -> MPN -> BOM -> Inventory Entry -> Centralized Inventory -> Planning -> Manufacturing -> Auto Inventory Update
```

## Run it

Requirements: Node 18+, a PostgreSQL database (Supabase project `vms`, or local Postgres 15+).

```bash
npm run install-all
cp backend/.env.example backend/.env      # set DATABASE_URL (see below)
npm run dev                               # API http://localhost:5000, UI http://localhost:3000
```

**Supabase connection:** Supabase Dashboard -> Project `vms` -> Connect -> Session pooler URI, e.g.
`postgresql://postgres.hqpkgutythloohankart:<DB_PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`.
Put it only in `backend/.env` (git-ignored). SSL is enabled automatically. The Supabase database already has the
schema and your migrated data; the API applies any newer migration on start (`AUTO_MIGRATE=true`).

**Local Postgres instead:** set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/erp_dev`, then
`npm run migrate --prefix backend` and `npm run seed:demo --prefix backend` for demo data.

**Tests:** `npm test` - 21 end-to-end API tests against a throw-away database (`TEST_DATABASE_URL`, wiped on every run).

## Architecture

| Layer | Where |
|---|---|
| Master data | `companies`, `locations`, `warehouses`, `vendors`, `materials`, `mpns`, `mpn_vendors`, `boms`, `bom_lines`, `app_settings` |
| Transactions | `stock_transfers`, `plans`, `plan_events`, `batches`, `batch_inputs` |
| Logic | `backend/src/routes/*`, `backend/src/services/planning.js`, DB function `erp.post_stock()` |
| Storage | `inventory` (Centralized Inventory, unique MPN + Location + WH + Lot), `stock_ledger` (immutable Audit Ledger) |

Rules enforced **in the database** (not only in the API):

- `inventory` can only change through `erp.post_stock()` (trigger guard); quantity `>= 0` (negative stock impossible).
- Every stock change writes a `stock_ledger` row with the new balance; the ledger rejects UPDATE/DELETE/TRUNCATE.
- Warehouses must belong to the location used (composite foreign keys); one default WH per location.
- Expired lots cannot be issued (`OUTWARD`) or consumed (`MFG_CONSUMPTION`).
- One ACTIVE BOM per product + location; BOM versions are immutable once active (revise into a new draft).
- Multi-step operations (batch execution, transfer completion, batch edits) run in one DB transaction:
  any failure rolls back every change. Concurrent issues on one lot are serialised by row locks.

Roles are the existing Supabase `user_profiles.role` values: `admin` (everything, incl. stock adjustments,
plan-target changes, variance-tolerance override, settings), `editor` (day-to-day transactions), `viewer` (read only).

## Workflows

1. **Inventory** - Stock page: Inward (MPN, Location, WH, Lot, Qty, Mfg/Expiry, Vendor), Outward (FEFO lot list,
   expired blocked), Transfers (Draft -> In-Transit -> Completed; stock moves only on Completed, two ledger rows,
   lot dates preserved), Adjustment (Admin: New Physical - System).
2. **Planning** - Product + Demand + Location -> active BOM, `batches = ceil(demand / expected output)`,
   `required = qty_per_batch x batches x (1 + scrap%)` (scrap optional per plan / default in Settings),
   availability = non-expired stock at the location. Plan, Batch and Material summaries.
   Editing the target (Admin) recalculates Remaining = Target - Executed and re-explodes the BOM for the remainder.
3. **Manufacturing** - Batch Entry: Batch Detail, Output vs Plan, Material Inputs with a lot per material (FEFO
   suggested), variance per material; above tolerance needs a reason (Admin can override). Edit IP/OP posts deltas only.
4. **Auto inventory update** - on submit: RM lots deducted, FG lot (= batch no) created, plan executed qty updated,
   every posting referenced to the batch in the ledger.
5. **Reports** - Stock Balance Sheet, printable Physical Stock Sheet (Admins can post counts as adjustments),
   Transaction Report (filters: date, location/WH, MPN, type; CSV), Traceability (backward + forward, recursive).

## API (all under `/api`)

`session`, `settings`, `locations` (+`/:id/warehouses`), `warehouses`, `vendors`, `materials`, `mpns`,
`boms` (+`/active`, `/:id/activate|obsolete|revise`), `inventory/stock|lots|inward|outward|adjustments|ledger`,
`transfers` (+`/:id/dispatch|complete|cancel`), `plans` (+`/simulate`, `PATCH /:id`, `/:id/cancel`),
`batches` (+`/prefill`, `PUT /:id`), `reports/stock-balance|physical-stock-sheet|lots|trace`.
Headers: `X-User-Id` (acting user), `X-Location-Id`, `X-Warehouse-Id` (global scope).

## Migration history

The v1 Supabase tables were moved (not deleted) to schema `archive_v1`; see `backend/db/supabase/`.
The previous MongoDB/Express/Firebase code is in git history (branch `master`); old notes are in `docs/archive/`.
