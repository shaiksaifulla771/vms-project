# RLS Verification Checklist

Automated checks (`mcp__Supabase__get_advisors` / the Supabase dashboard
linter) confirm RLS is enabled everywhere and catch structural gaps, but
they can't confirm the policies produce the *intended* access pattern.
This is the manual checklist for that, run once against a live project
with three real test users (one per role) after applying
`docs/schema.sql` (or `docs/migrations/*.sql` in order).

## Setup
1. Sign up three users via Supabase Auth (or the app's own sign-up form).
2. Promote them directly in the DB:
   ```sql
   UPDATE public.user_profiles SET role = 'admin'  WHERE email = 'admin@example.com';
   UPDATE public.user_profiles SET role = 'editor' WHERE email = 'editor@example.com';
   -- the third stays the default 'viewer'
   ```
3. Get a bearer JWT for each (sign in via the frontend, or
   `supabase.auth.signInWithPassword` from a script) and call
   `GET /api/v1/me` with each to confirm the role reported matches.

## Checklist

### Masters (vendors, materials, products, boms, bom_items, MPN, pricing)
- [ ] viewer: `GET` every masters endpoint succeeds (200).
- [ ] viewer: `POST`/`PATCH` on every masters endpoint fails (403 from the
      API layer — `require_admin` rejects before ever reaching the DB).
- [ ] editor: same as viewer — masters writes are admin-only.
- [ ] admin: `POST`/`PATCH` succeeds; the created row's `created_by`
      equals the admin's own `auth.uid()` (never client-supplied).
- [ ] admin: attempting to `INSERT ... created_by = <someone else's uuid>`
      directly via SQL as the `authenticated` role (impersonating this
      admin's JWT claims) fails — the RLS `WITH CHECK` on `created_by`
      rejects it even though the API layer already blocks it.

### Vendor lifecycle
- [ ] admin: `POST /vendors/{id}/status` DRAFT→APPROVED→ACTIVE succeeds
      in order.
- [ ] admin: DRAFT→ACTIVE directly (skipping APPROVED) returns 409
      `InvalidStateTransitionError`.
- [ ] admin: BLACKLISTED→anything returns 409 (terminal state).
- [ ] editor/viewer: `POST /vendors/{id}/status` returns 403.

### Purchase Requests
- [ ] editor: `POST /purchase-requests` succeeds; `created_by` is the
      editor's own id.
- [ ] editor A: cannot `PATCH`/edit line items on editor B's DRAFT PR
      (RLS `pr_items_update`/`pr_items_insert` scope to
      `pr.created_by = auth.uid()`).
- [ ] editor: `POST .../submit` on their own DRAFT PR succeeds.
- [ ] editor: `POST .../approve` or `.../reject` returns 403 (admin-only
      at the API layer).
- [ ] admin: `.../approve` succeeds from SUBMITTED; retry-approving an
      already-APPROVED PR returns 409.
- [ ] editor: `PATCH` on a SUBMITTED PR's items fails — `pr_items_update`
      only allows edits while `pr.status = 'DRAFT'`.

### Purchase Orders
- [ ] admin: `POST /purchase-orders/from-purchase-request/{id}` on an
      APPROVED PR with all lines covered succeeds; the PR flips to
      CONVERTED.
- [ ] admin: same call with lines that don't sum to the PR's requested
      quantity returns 422 `ValidationFailedError`.
- [ ] admin: converting against a vendor with status SUSPENDED or DRAFT
      returns 409 `VendorNotOrderableError`; BLACKLISTED returns 409
      `BlacklistedVendorError`.
- [ ] admin: retrying the identical conversion call (same
      `idempotency_key`) returns the same PO(s), not a duplicate.
- [ ] admin: `POST .../issue` on a DRAFT PO succeeds; issuing twice
      returns 409.
- [ ] editor: `POST .../receipts` on an ISSUED PO succeeds; `created_by`
      is the editor's own id.
- [ ] editor: a receipt whose `received_qty` exceeds the line's
      remaining quantity returns 409 `ReceiptOverdrawnError`.
- [ ] viewer: `POST .../receipts` returns 403.
- [ ] admin: `POST .../close` only succeeds once the PO is fully RECEIVED.

### Audit log
- [ ] Every state transition above produces a matching `audit_log` row
      (`SELECT * FROM audit_log WHERE entity_id = '<id>' ORDER BY
      created_at`) with the correct `actor_id`.
- [ ] Attempting a direct `INSERT INTO public.audit_log (...)` as any
      role fails — there is no INSERT policy; only
      `internal.record_audit()` (SECURITY DEFINER) can write it.
- [ ] Calling `/rest/v1/rpc/record_audit` or
      `/rest/v1/rpc/next_pr_number` over HTTP (PostgREST) returns 404 —
      confirms `internal` is not in Supabase's exposed schema list.

### Concurrency
- [ ] Two concurrent receipts against the same PO item, both within the
      remaining quantity individually but not combined, result in
      exactly one succeeding and the other returning 409
      `ReceiptOverdrawnError` (never both succeeding and overdrawing the
      line) — the `FOR UPDATE` lock in `record_receipt` serializes them.
- [ ] A request that holds a lock past `LOCK_TIMEOUT_MS` returns 409
      `{"retryable": true}`, not a hung connection.

### Locations, Inventory & Manufacturing (added with migration 0006)
- [ ] viewer: `GET /locations`, `/warehouses`, `/inventory/*`, `/plans`,
      `/batches` all succeed; every `POST`/write endpoint under them
      returns 403.
- [ ] admin: `POST /locations` succeeds; the row's default warehouse
      ("Main Warehouse (WH-01)") is visible immediately in
      `GET /warehouses?location_id=<id>` (confirms
      `trg_auto_create_default_warehouse` fired).
- [ ] editor: `POST /inventory/entries/inward` creates a new lot (if
      `lot_number` doesn't already exist in that warehouse) with a
      matching `inventory_transactions` row and
      `inventory_lots.quantity_on_hand` equal to the posted quantity.
- [ ] editor: `POST /inventory/entries/outward` on a lot with
      insufficient `quantity_on_hand` returns 409
      `InsufficientStockError` — `quantity_on_hand` and the ledger are
      unchanged (the DB function's CHECK constraint rejected the write
      before any row changed).
- [ ] Attempting a direct `INSERT`/`UPDATE`/`DELETE` on
      `public.inventory_transactions` as the `authenticated` role (any
      role) fails — those privileges are revoked entirely; only
      `internal.post_inventory_transaction()` (SECURITY DEFINER) can
      write it.
- [ ] editor: `POST /plans` with a demand line whose required quantity
      exceeds on-hand availability still succeeds (status `SHORT` on
      that material line) — Planning never blocks on availability.
- [ ] editor: `POST /batches` then `POST /batches/{id}/start` then
      `POST /batches/{id}/complete` with input lines matching the active
      BOM's material set exactly succeeds; `inventory_lots.
      quantity_on_hand` for each consumed material lot decreases by the
      drawn amount and the new finished-goods lot's `quantity_on_hand`
      equals `actual_output_qty`.
- [ ] editor: completing the same batch a second time returns 409
      `InvalidStateTransitionError` (already `COMPLETED`).
- [ ] editor: an input line whose variance vs. the BOM-derived planned
      quantity exceeds `products.variance_tolerance_percent` with no
      `reason_notes` returns 422 `ToleranceExceededError`; the identical
      call with `reason_notes` set succeeds.
- [ ] editor: `POST /batches/{id}/correct-output` and
      `POST /batches/{id}/actual-inputs/{input_id}/correct` on a
      COMPLETED batch each post a new `DYNAMIC_RECONCILIATION` ledger row
      (the original `MFG_CONSUMPTION`/`MFG_PRODUCTION` rows are
      untouched) and update the lot's `quantity_on_hand` accordingly.
- [ ] A correction that would drive a lot's `quantity_on_hand` negative
      returns 409 `CorrectionWouldGoNegativeError` with no ledger row
      written.
- [ ] Reconciliation: `GET /inventory/reconciliation` (admin) returns
      zero rows before and after the above — `quantity_on_hand` always
      equals the sum of that lot's ledger transactions.

### Advisor findings (accepted)
- [ ] `mcp__Supabase__get_advisors` (security) reports exactly one WARN:
      `public.get_auth_role()` is `SECURITY DEFINER` and executable by
      `authenticated`. This is intentional and required — both
      `get_current_user`'s API-layer role check and every RLS policy's
      `(select public.get_auth_role())` predicate call it as the
      `authenticated` role; revoking `EXECUTE` would break RBAC and RLS
      entirely. It only ever returns the caller's own role (scoped
      internally by `auth.uid()`), so it grants no access to another
      user's data. No other security findings should be present —
      migration 0007 revoked the public-schema Supabase platform helper
      `rls_auto_enable()`'s inherited `PUBLIC`/`anon`/`authenticated`
      EXECUTE grants, since no client role has a legitimate reason to
      call it directly (it only ever runs via the DDL event-trigger
      mechanism).
- [ ] `mcp__Supabase__get_advisors` (performance) reports only INFO-level
      `unindexed_foreign_keys` (audit columns — `created_by`/
      `updated_by` — and a handful of low-traffic relationship columns,
      the same class already present on the pre-existing domain) and
      `unused_index` (expected on a project with no production query
      history yet). Neither is a regression versus the bar the
      pre-existing vendor/procurement domain was already at.
