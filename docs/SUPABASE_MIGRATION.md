# Supabase migration (project `vms`, 23 Sep 2026)

Applied directly to the Supabase project (all steps are in `backend/db/`):

| Step | File | Result |
|---|---|---|
| 1 | `db/supabase/100_archive_v1.sql` | 47 v1 tables + enums moved from `public` to `archive_v1` (nothing deleted). `public.user_profiles` and roles untouched. Obsolete helper functions dropped (incl. `internal.post_inventory_transaction`, which required a user JWT and could never be called by the backend). |
| 2 | `db/migrations/001..005` | New spec schema, `erp.post_stock()`, immutable ledger, guards, RLS on (no policies = not exposed via Supabase API keys), FK indexes. Recorded in `erp.schema_migrations`. |
| 3 | `db/supabase/900_migrate_from_archive_v1.sql` | 4 locations, 10 warehouses, 43 vendors, 109 materials (85 materials + 24 v1 products), 109 MPNs, 85 MPN-vendor links, 23 BOMs (22 active) with 225 lines, 108 lots = 218,250 units as OPENING ledger entries. |

## v1 mistakes that were fixed

- Inventory posting function required an authenticated Supabase user (`get_auth_role()`), so the backend could not post stock.
- Audit ledger was editable/deletable; no `updated_at` maintenance; batch/plan numbers generated with `MAX()+1` (race-prone).
- BOMs had no batch size, expected output, location/WH or scrap %; FG-RL1 had two version-1 BOMs.
- Products and materials were separate masters; stock lots pointed at either.
- Non-spec tables (visitors, appointments, workflows, approvals, purchasing, QC, email, notifications, contracts).

## Please review in the app

1. **BOM expected output** - v1 had none, so it was set equal to the batch size (in the product's UOM). Open each BOM, create a new version with the real expected output, activate it.
2. **UOMs** - 59 v1 BOM lines used a different UOM than the material master; lines now use the material UOM. Several v1 raw-material lots were recorded in `pcs` while the material is in `kg`; stock now carries the material UOM.
3. **Classification** - v1 products `M1001` (AMOND POWDEF) and `RM-RETORTABLE-200GM` became materials (Raw Material / Packaging).
4. **Test records** - the 2 v1 plans and 1 unexecuted batch were test data and were not migrated (still in `archive_v1`).

## Connecting the backend

Use the Session pooler URI from Supabase Dashboard -> Connect in `backend/.env` (`DATABASE_URL`). Do not commit it.
