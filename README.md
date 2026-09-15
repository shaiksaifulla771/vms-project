# VMS — Vendor Management System

A production-grade Vendor Management System: vendor lifecycle, MPN
(material↔vendor) mapping, effective-dated vendor pricing, procurement
(Purchase Request → Purchase Order → Receipt), and vendor performance
analytics. Standalone by design, and integration-ready with a
BatchCore-like ERP that shares the `materials` / `vendors` /
`material_vendors` shape.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| Database | PostgreSQL 16/17 (Supabase), Row Level Security on every business table |
| Auth | Supabase Auth, JWT verified server-side via JWKS |
| Frontend | React 18, TypeScript, Vite |
| Architecture | API → Service → DB (strict layering, see `docs/ARCHITECTURE.md`) |

See `CLAUDE.md` for the full project rules, `docs/DOMAIN.md` for the
entity/relationship reference, `docs/RBAC.md` for the authorization
matrix, and `docs/ARCHITECTURE.md` for the request lifecycle and
concurrency model.

## Folder structure

```
.
├── CLAUDE.md                   project rules for AI-assisted development
├── docs/
│   ├── DOMAIN.md                entities, constraints, lifecycle states
│   ├── ARCHITECTURE.md          API -> Service -> DB, concurrency, errors
│   ├── RBAC.md                  authorization matrix
│   ├── schema.sql                single-source-of-truth schema for a fresh deploy
│   └── migrations/              0001..000N, apply in order against an existing DB
├── backend/
│   ├── app/
│   │   ├── core/                 config, db session (RLS claims), auth, logging
│   │   ├── models/                SQLAlchemy 2.0 async models (mirrors schema.sql)
│   │   ├── schemas/               Pydantic request/response models
│   │   ├── services/              business rules, one transaction per call
│   │   ├── api/routes/            FastAPI routers (thin controllers)
│   │   ├── exceptions.py          typed domain exceptions
│   │   └── main.py                app factory, exception -> HTTP mapping
│   ├── tests/unit/                pure-logic unit tests (no live DB needed)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── lib/supabase.ts        Supabase JS client
    │   ├── auth/AuthContext.tsx   session + role (via GET /api/v1/me)
    │   ├── api/                    typed fetch client with retry-on-409
    │   ├── components/            Layout, RoleGate, StatusBadge, etc.
    │   └── pages/                  Vendors, MPN, Pricing, PR/PO, Analytics
    └── package.json
```

## Run commands

### 1. Database (Supabase)
Create a Supabase project, then apply `docs/schema.sql` (fresh deploy)
or run every file in `docs/migrations/` in order (existing DB):

```bash
# via the Supabase SQL editor, or the Supabase CLI / MCP apply_migration tool
psql "$SUPABASE_DB_URL" -f docs/schema.sql
```

`docs/schema.sql` provisions:
- every table with RLS enabled and `created_by UUID NOT NULL DEFAULT auth.uid()`
- `public.get_auth_role()` — the role resolver every RLS policy and the
  backend's auth dependency both call
- `internal.record_audit()` / `internal.next_{pr,po,grn}_number()` — kept
  out of the `public` schema so they are never reachable as a PostgREST
  RPC endpoint (see `docs/migrations/0003_*.sql`)
- a trigger that auto-provisions a `user_profiles` row (role `viewer`) on
  every new `auth.users` insert, so a fresh sign-up never 403s on `/me`

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in DATABASE_URL (the `authenticated` role, never service_role)
# and SUPABASE_URL
uvicorn app.main:app --reload
# -> http://localhost:8000/docs (OpenAPI UI)
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm run dev
# -> http://localhost:5173
```

### 4. Tests

```bash
cd backend
pytest
```

Ships 65 unit tests covering the vendor/PR/PO state-transition tables,
SQLSTATE → typed-exception mapping, rounding behavior, and the
retryable-lock-contention set — all runnable with zero live credentials.
Full RBAC/RLS behavior is verified against the live database via the
checklist in `docs/RLS_VERIFICATION.md` and the Supabase security/
performance advisors (`mcp__Supabase__get_advisors`).

## Creating your first admin

A fresh sign-up always lands as `viewer` (the auto-provision trigger's
default). Promote the first user to `admin` directly in the database:

```sql
UPDATE public.user_profiles SET role = 'admin' WHERE email = 'you@example.com';
```

Every subsequent role change goes through `PATCH /api/v1/users/{id}/role`
(admin-only) from the app itself.

## API reference

Full OpenAPI docs are served at `/docs` (Swagger UI) and `/redoc` once
the backend is running. A summary of the route surface:

| Resource | Routes |
|---|---|
| Health | `GET /healthz` |
| Identity | `GET /api/v1/me` |
| Users (admin) | `GET /api/v1/users`, `PATCH /api/v1/users/{id}/role` |
| Vendors | `GET/POST /api/v1/vendors`, `GET/PATCH /api/v1/vendors/{id}`, `POST /api/v1/vendors/{id}/status` |
| Materials | `GET/POST /api/v1/materials`, `GET/PATCH /api/v1/materials/{id}` |
| Products | `GET/POST /api/v1/products`, `GET/PATCH /api/v1/products/{id}` |
| BOM | `GET/POST /api/v1/products/{id}/boms`, `POST .../boms/{bom_id}/activate\|deactivate` |
| MPN mapping | `GET/POST /api/v1/mpn`, `GET/PATCH /api/v1/mpn/{id}`, `POST /api/v1/mpn/{id}/set-preferred` |
| Vendor pricing | `POST /api/v1/pricing`, `GET /api/v1/pricing/mpn/{id}/history\|current`, `GET /api/v1/pricing/material/{id}/compare` |
| Purchase Requests | `GET/POST /api/v1/purchase-requests`, `GET /api/v1/purchase-requests/{id}`, `POST .../submit\|approve\|reject\|cancel` |
| Purchase Orders | `GET /api/v1/purchase-orders`, `GET /api/v1/purchase-orders/{id}`, `POST /api/v1/purchase-orders/from-purchase-request/{pr_id}`, `POST .../issue\|close\|cancel`, `POST .../receipts` |
| Analytics | `GET /api/v1/analytics/vendor-scorecard` |

Every mutating route requires `Authorization: Bearer <supabase-jwt>` and
enforces `viewer < editor < admin` per `docs/RBAC.md`.
