# Architecture

## Layering (strict)

```
             HTTP
              │
              ▼
 ┌──────────────────────────┐
 │  app/api/routes/*.py     │  FastAPI. Auth dep, role dep, Pydantic
 │  (thin controllers)      │  request/response models. NO business
 └────────────┬─────────────┘  rules, NO SQL, NO transactions.
              │
              ▼
 ┌──────────────────────────┐
 │  app/services/*.py       │  Business rules. Owns the transaction
 │  (one txn per method)    │  boundary. Reads/writes via models.
 │                          │  Raises typed exceptions from
 │                          │  app/exceptions.py.
 └────────────┬─────────────┘
              │
              ▼
 ┌──────────────────────────┐
 │  app/models/*.py         │  SQLAlchemy 2.0 async ORM. One class
 │                          │  per table, mirrors docs/schema.sql.
 │                          │  No methods beyond column mappings.
 └────────────┬─────────────┘
              │
              ▼
 ┌──────────────────────────┐
 │  PostgreSQL (Supabase)   │  FK constraints, CHECK constraints,
 │                          │  RLS policies as second gate.
 └──────────────────────────┘
```

## Request lifecycle
1. FastAPI receives an HTTP request with `Authorization: Bearer <jwt>`.
2. `HTTPBearer` extracts the credential; `_decode_jwt` verifies it
   against Supabase's JWKS (asymmetric) or the legacy HS256 secret if
   the project still uses it.
3. `build_session` opens a SQLAlchemy async session, begins a
   transaction, sets:
   - `SELECT set_config('request.jwt.claims', <json claims>, true)`
   - `SET LOCAL ROLE authenticated`
   - `SET LOCAL lock_timeout = '<n>ms'`
   - `SET LOCAL statement_timeout = '<n>ms'`
4. `get_current_user` calls `SELECT public.get_auth_role()` — the same
   `STABLE SECURITY DEFINER` function every RLS policy consults, so the
   role the API dep sees and the role the policy sees are guaranteed to
   match.
5. The route dep chain enforces `require_viewer` / `require_editor` /
   `require_admin`.
6. Route calls **one** service method, passing the session.
7. Service runs its business rules within that single transaction.
8. On success, `build_session` commits. On any exception, the session
   rolls back — all-or-nothing.

## Concurrency
- Each mutation runs in one transaction; there is no "partial write"
  state to reconcile after a failure.
- Hot rows are locked with `SELECT ... FOR UPDATE`. `SET LOCAL
  lock_timeout` caps how long we wait — a hold longer than that raises
  Postgres SQLSTATE `55P03`, which the app maps to
  `HTTP 409 {"retryable": true}`. Because every mutation is idempotent
  on a natural key, the client can safely resend the identical request.
- No advisory locks; no long-running background jobs holding locks.

## Idempotency
- PR and PO numbers are generated inside the service and returned to the
  client. A client-supplied `Idempotency-Key` on `POST /purchase-orders`
  and PR-to-PO conversion is stored on `purchase_orders.idempotency_key`
  (UNIQUE) so a network retry does not create duplicate POs.

## Error handling
Domain services raise typed exceptions
(`app/exceptions.DomainError` and subclasses). FastAPI handlers
registered in `app/main.py` translate them to HTTP status:

| Exception | HTTP | Meaning |
|---|---|---|
| `NotFoundError` | 404 | entity not found |
| `ValidationFailedError` | 422 | business validation failed |
| `ConflictError` | 409 | state/uniqueness conflict |
| `InvalidStateTransitionError` | 409 | e.g. approving a rejected PR |
| lock-contention `DBAPIError` | 409 (retryable) | fail-fast timeout |
| `DomainError` (base) | 400 | anything else typed |

Routes must never catch these and rewrap into a raw 500.

## Frontend
Vite + React 18 + TypeScript. `src/lib/supabase.ts` boots the Supabase
JS client; `src/auth/AuthContext.tsx` listens on session changes and
calls `GET /api/v1/me` to resolve the *authoritative* role from the
backend — the JWT is never trusted client-side for authorization. Every
API call flows through `src/api/client.ts`, which attaches the current
bearer token, parses `{ detail, retryable }` errors, and applies bounded
exponential backoff on retryable 409s.

Role-aware rendering is a convenience only: RLS still re-checks every
write.

## Deployment
- Backend: `uvicorn app.main:app` behind any HTTP reverse proxy.
- Frontend: static SPA (`npm run build`), served from any CDN.
- Database: Supabase-managed Postgres. Migrations apply in order from
  `docs/migrations/`; `docs/schema.sql` is the fresh-DB shortcut.
