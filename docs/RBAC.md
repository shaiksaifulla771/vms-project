# RBAC — Authorization Matrix

Two enforcement layers, always both:
1. FastAPI route dependency (`require_viewer` / `require_editor` /
   `require_admin`).
2. PostgreSQL RLS policy on the target table, keyed on
   `public.get_auth_role()`.

Both consult `user_profiles.role` for `auth.uid()`; they cannot disagree.

## Roles
| Role | Rank |
|---|---|
| viewer | 0 |
| editor | 1 |
| admin | 2 |

Ranking is used by the API layer's `require_role(min)` — a caller needs
role rank `>= min`. RLS policies are enumerated (e.g.
`get_auth_role() IN ('admin', 'editor')`) — never rank comparisons —
because Postgres doesn't rank enum values by declaration order.

## Matrix

### Master data
| Resource | viewer | editor | admin |
|---|---|---|---|
| `vendors` — read | ✅ | ✅ | ✅ |
| `vendors` — write | ❌ | ❌ | ✅ |
| `vendors` — status change | ❌ | ❌ | ✅ |
| `materials` — read | ✅ | ✅ | ✅ |
| `materials` — write | ❌ | ❌ | ✅ |
| `products` — read | ✅ | ✅ | ✅ |
| `products` — write | ❌ | ❌ | ✅ |
| `boms` / `bom_items` — read | ✅ | ✅ | ✅ |
| `boms` / `bom_items` — write | ❌ | ❌ | ✅ |
| `material_vendors` (MPN) — read | ✅ | ✅ | ✅ |
| `material_vendors` (MPN) — write | ❌ | ❌ | ✅ |
| `vendor_prices` — read | ✅ | ✅ | ✅ |
| `vendor_prices` — write | ❌ | ❌ | ✅ |

### Procurement
| Resource | viewer | editor | admin |
|---|---|---|---|
| `purchase_requests` — read | ✅ | ✅ | ✅ |
| `purchase_requests` — create/submit | ❌ | ✅ | ✅ |
| `purchase_requests` — approve / reject / convert | ❌ | ❌ | ✅ |
| `purchase_request_items` — read | ✅ | ✅ | ✅ |
| `purchase_request_items` — write (while PR is DRAFT and owned by caller) | ❌ | ✅ | ✅ |
| `purchase_orders` — read | ✅ | ✅ | ✅ |
| `purchase_orders` — create / issue / close / cancel | ❌ | ❌ | ✅ |
| `purchase_order_items` — read | ✅ | ✅ | ✅ |
| `purchase_order_items` — write | ❌ | ❌ | ✅ |
| `purchase_order_receipts` — read | ✅ | ✅ | ✅ |
| `purchase_order_receipts` — create | ❌ | ✅ | ✅ |

### Locations, Inventory, Planning & Manufacturing
| Resource | viewer | editor | admin |
|---|---|---|---|
| `locations` — read | ✅ | ✅ | ✅ |
| `locations` — write | ❌ | ❌ | ✅ |
| `warehouses` — read | ✅ | ✅ | ✅ |
| `warehouses` — write | ❌ | ❌ | ✅ |
| `inventory_lots` — read (lots, availability) | ✅ | ✅ | ✅ |
| `inventory_transactions` — read (ledger) | ✅ | ✅ | ✅ |
| `inventory_transactions` — reconciliation report | ❌ | ❌ | ✅ |
| Manual Inventory Entry (Add Stock / Remove Stock) | ❌ | ✅ | ✅ |
| `plans` — read | ✅ | ✅ | ✅ |
| `plans` — create | ❌ | ✅ | ✅ |
| `batch_records` — read | ✅ | ✅ | ✅ |
| `batch_records` — create / start / cancel | ❌ | ✅ | ✅ |
| `batch_records` — complete | ❌ | ✅ | ✅ |
| Dynamic IP/OP Correction (output or input line) | ❌ | ✅ | ✅ |

Batch completion and Dynamic IP/OP Correction are the operations that
actually move inventory, so they sit at `editor+` rather than
`admin`-only — production-floor operators are typically `editor`, the
same tightness the reference BatchCore system uses. Plan creation and
location/warehouse master-data writes stay admin-only, matching every
other master in this system. `inventory_transactions` is never writable
directly by any role, including admin — `INSERT`/`UPDATE`/`DELETE` are
revoked from `authenticated` at the grant level; the only writer is
`internal.post_inventory_transaction()`, called from
`InventoryLedgerService`.

### Governance
| Resource | viewer | editor | admin |
|---|---|---|---|
| `user_profiles` — read own row | ✅ | ✅ | ✅ |
| `user_profiles` — read all | ❌ | ❌ | ✅ |
| `user_profiles.role` — update | ❌ | ❌ | ✅ |
| `audit_log` — read | ✅ | ✅ | ✅ |
| `audit_log` — write | (service only, via SECURITY DEFINER function) | | |

## Notes
- `audit_log` inserts happen via `internal.record_audit(...)`, a SECURITY
  DEFINER function called from service code over the backend's own direct
  Postgres connection — client code cannot write to the table directly (no
  INSERT policy), and the function is not reachable as a PostgREST RPC
  endpoint since `internal` is never in Supabase's exposed schema list.
- The `created_by`/`updated_by` audit columns default to `auth.uid()` at
  the DB layer, so a service that forgets to set them still records a
  correct actor. WITH CHECK on RLS policies forbids
  `created_by <> auth.uid()` on INSERT.
