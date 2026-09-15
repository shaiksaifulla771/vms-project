# CLAUDE.md

## Project Overview
Production-grade Vendor Management System (VMS). Runs standalone, and is
designed to integrate with the BatchCore-like ERP-SYSTEM
(https://github.com/shaiksaifulla771/ERP-SYSTEM) that shares its
`materials` / `vendors` / `material_vendors (MPN)` shape. The two systems
are independently deployable; VMS owns vendor lifecycle, MPN mapping,
vendor pricing (with history), procurement (Purchase Request → Purchase
Order → Receipt) and vendor performance analytics.

Status: rewrite from scratch on `claude/blissful-wright-ax8bt6`. The prior
Node/Express + MongoDB + Firebase implementation was deleted in the first
commit on this branch; every commit that follows introduces one layer of
the new system.

## Tech Stack
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 async + asyncpg,
  Pydantic v2
- **Database:** PostgreSQL 16 (Supabase). Row Level Security enforced on
  every business table; it is a second, independent authorization layer,
  not a fallback for the API layer.
- **Auth:** Supabase Auth (email/password + OAuth). Backend verifies JWTs
  via Supabase's published JWKS; the RLS session is opened with the
  request's claims so `auth.uid()` and `get_auth_role()` resolve
  per-request.
- **Frontend:** React 18 + TypeScript + Vite. Role-aware rendering; every
  write is re-checked by RLS regardless of what the UI allows.
- **Architecture:** strict API → Service → DB. Routes do HTTP + auth deps
  + Pydantic validation; services own the transaction and business rules;
  models describe the tables and nothing else.

## Setup
```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
# apply docs/schema.sql (or the docs/migrations/*.sql files in order) to
# your Supabase project, then:
cp backend/.env.example backend/.env  # fill in DATABASE_URL, SUPABASE_URL
uvicorn app.main:app --reload --app-dir backend

# frontend
cd frontend
npm install
cp .env.example .env  # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
                      # VITE_API_BASE_URL
npm run dev

# tests
cd backend && pytest
```

## Non-Negotiable Rules
1. **Every write is auditable.** Business tables carry `created_by UUID
   NOT NULL DEFAULT auth.uid()`; updates set `updated_by` and bump
   `updated_at`. There is no legitimate write path that bypasses this.
2. **RLS is on for every business table.** The API layer's role check and
   the RLS predicate both read the exact same source of truth
   (`public.get_auth_role()`), and can never disagree.
3. **`DATABASE_URL` connects as the `authenticated` role**, never
   `service_role` or a superuser — RLS only matters if requests actually
   run through a connection RLS applies to.
4. **No demo data or mocks in code.** Fixtures live only under `tests/`.
5. **Every mutation is idempotent on a natural key** (PR/PO number, or a
   client-supplied idempotency key), so a retryable 409 (lock contention)
   is always safe to resend.
6. **Money and quantities are `NUMERIC(18,4)`** — never `float`.

## Roles
Three roles, ranked: `viewer` < `editor` < `admin`.
- **admin**: full CRUD on masters (vendors, materials, products, MPN,
  vendor pricing), can approve purchase requests, issue POs, close POs,
  and manage users.
- **editor**: read masters; can create purchase requests and record
  receipts against POs they were assigned. Cannot approve requests or
  issue POs.
- **viewer**: read-only across the entire system.

Full authorization matrix: `docs/RBAC.md`.

## Domain Model (short)
Vendor lifecycle: `DRAFT → APPROVED → ACTIVE → SUSPENDED → BLACKLISTED`.
Purchase Request: `DRAFT → SUBMITTED → APPROVED → CONVERTED / REJECTED /
CANCELLED`. Purchase Order: `DRAFT → ISSUED → PARTIALLY_RECEIVED →
RECEIVED → CLOSED / CANCELLED`. Full entity and relationship reference:
`docs/DOMAIN.md`.

## Architecture (short)
```
HTTP  →  app/api/routes/*        (FastAPI, Pydantic, auth + role dep)
      →  app/services/*          (one transaction, business rules)
      →  app/models/*            (SQLAlchemy 2.0 async, mirrors schema)
      →  PostgreSQL              (constraints + RLS as second gate)
```
One session per request, one transaction per request; services never
open nested transactions. Per-request `SET LOCAL lock_timeout` and
`statement_timeout` fail fast under contention (SQLSTATE `55P03`), mapped
to a 409 with `retryable: true` at the API boundary so clients can safely
resend the identical request. Full: `docs/ARCHITECTURE.md`.

## Notes for Claude
**Never:**
- Add a fallback that lets a route bypass `require_role(...)` "just for
  now".
- Trust a role claim decoded from the JWT client-side — always call
  `public.get_auth_role()` server-side, the same function every RLS
  policy consults.
- Introduce a "system" or "service" user that owns rows so RLS can be
  skipped. Every write is done by an authenticated user.
- Widen an RLS policy to `USING (true)` on a mutating command.

**Always:**
- Route new tables through the same migration numbering
  (`docs/migrations/NNNN_description.sql`), and keep `docs/schema.sql` in
  sync — the schema file is the single-source-of-truth for a fresh
  deployment.
- Set `updated_at = now()` and `updated_by = auth.uid()` explicitly on
  UPDATE — there is no `BEFORE UPDATE` trigger for it.
- Return typed domain exceptions from services (`app/exceptions.py`); let
  FastAPI's registered handlers map them to HTTP status.
