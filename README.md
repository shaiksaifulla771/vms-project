# VMS — Vendor Management System

A vendor/material/inventory/manufacturing management system: vendor lifecycle, MPN (material↔vendor) mapping and pricing, BOM, inventory (lot-tracked), production planning and batch execution, procurement (Purchase Request → Purchase Order → Receipt), quality control, and governance (audit trail, RBAC, approvals).

## Current status: mid-migration

The app **runs today** on the original stack (below) with all modules functional. A migration to **Supabase Postgres** is **in progress** — the target database schema is designed, built, and applied, but the application code has not yet been switched over. See [`docs/schema.sql`](docs/schema.sql) and [`docs/migrations/`](docs/migrations/) for the target schema, and [`docs/manufacturing-inventory-implementation-plan.md`](docs/manufacturing-inventory-implementation-plan.md) for the manufacturing/inventory/planning domain spec driving it.

Do not assume the backend talks to Postgres yet — check `backend/config/db.js` (still Mongoose/MongoDB as of this PR).

## Tech stack

**Running today:**
- Backend: Node.js, Express, Mongoose (MongoDB)
- Frontend: React (Vite)
- Auth: custom JWT + bcrypt, with Firebase Admin SDK integration
- Background jobs: BullMQ (Redis), with in-memory fallback when Redis isn't configured

**Migration target:**
- Database: PostgreSQL via Supabase (project ref `hqpkgutythloohankart`), with Row Level Security on every business table
- ORM/client: Prisma (`backend/prisma/schema.prisma`, introspected from the live database — the SQL migration files are the source of truth, not Prisma Migrate)
- Auth: Supabase Auth (JWT verified against Supabase's JWKS), replacing the custom JWT/bcrypt/Firebase stack

## Project structure

```
backend/    Express API (Mongoose today; Prisma/Postgres client generated, not yet wired in)
  models/       Mongoose schemas (current data layer)
  controllers/  Route handlers
  services/     Business logic
  prisma/       Generated Prisma schema (introspected from Supabase)
frontend/   React app (Vite)
docs/
  schema.sql              Full Postgres schema (single-source-of-truth for a fresh Supabase deployment)
  migrations/              Numbered SQL migrations (0001-0007 from the original schema build, 0008-0014 extending it)
  manufacturing-inventory-implementation-plan.md   Domain spec for manufacturing/inventory/planning
```

## Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, etc.
npm run dev             # http://localhost:5000
```
If no local MongoDB is reachable, `backend/config/db.js` automatically falls back to an in-memory MongoDB instance for local development (seeds demo master data on boot).

### Frontend
```bash
cd frontend
npm install
npm run dev              # http://localhost:3000 (or next available port)
```

### Tests
```bash
cd backend
npm run test:all
```

## Database (Postgres/Supabase) — migration in progress

The Supabase project already has the full target schema applied (48 tables in `public`, RLS-enabled, following the conventions documented at the top of `docs/schema.sql`). To point the backend at it once the application-layer migration lands, `backend/.env` needs `DATABASE_URL` (pooled connection, runtime) and `DIRECT_URL` (session/direct connection, migrations) — see the comments in `backend/prisma/schema.prisma` and `backend/prisma7.config.ts` for how these are wired.

Until the backend rewrite is complete, treat the Postgres schema as the target, not the live data store.
