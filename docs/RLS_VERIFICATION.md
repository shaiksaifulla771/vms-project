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
