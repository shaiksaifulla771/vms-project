-- ============================================================================
-- Vendor Management System — Production Database Schema (Supabase PostgreSQL)
-- Single-source-of-truth for a fresh deployment. Numbered migrations under
-- docs/migrations/ apply the same DDL incrementally against an existing DB
-- and must be kept in sync with this file.
--
-- Reviewer note (drift reconciliation): sections 0-11 below reproduce the
-- historical single-file schema as originally captured in this repo's
-- docs history. Cross-checking that capture against the LIVE database's
-- introspected shape (backend/prisma/schema.prisma, pulled directly from
-- the running Supabase project) turned up five tables — materials, boms,
-- material_vendors, products, vendors — that already carry
-- deleted_at/deleted_by soft-delete columns (plus a matching partial
-- index) on the live database, with no corresponding migration file
-- present in this repo to explain how they got there (applied out-of-band,
-- e.g. via the Supabase dashboard, at some point after the historical
-- capture). Since this file's job is to be a single-source-of-truth a
-- *fresh* deployment can run to reach the actual current production shape,
-- those five tables have been patched in-place below (marked "live-DB
-- reconciliation") rather than silently reproducing a now-stale shape.
-- Sections 12 onward (0008-0014) are new domains added in this change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions & enums
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- btree_gist (needed for vendor_prices' no-overlap EXCLUDE constraint)
-- lives in its own schema, never in public — the Supabase security
-- advisor flags any extension installed into public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA extensions;

-- internal holds backend-only plumbing (audit writer, number generators,
-- the auth.users provisioning trigger function) that must NEVER be
-- reachable as a PostgREST RPC endpoint. public is PostgREST's exposed
-- API schema — anything there with EXECUTE granted to authenticated is
-- callable over HTTP by any signed-in user with arguments of their
-- choosing, and GRANT/REVOKE can't tell "our backend's own SQL call"
-- apart from "a user's PostgREST RPC call" since both run as the same
-- `authenticated` Postgres role. The only real fix is keeping this code
-- out of the exposed schema entirely.
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
GRANT USAGE ON SCHEMA internal TO authenticated;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE master_data_status AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE item_classification AS ENUM (
        'RAW_MATERIAL', 'PACKAGING', 'EMULSIFIER', 'CONSUMABLE', 'FINISHED_GOOD'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE vendor_status AS ENUM (
        'DRAFT', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'BLACKLISTED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE price_source AS ENUM ('QUOTE', 'CONTRACT', 'SPOT', 'PO_HISTORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE pr_status AS ENUM (
        'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE po_status AS ENUM (
        'DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE',
        'REJECT', 'CONVERT', 'ISSUE', 'RECEIVE', 'CLOSE', 'CANCEL'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. user_profiles (mirrors auth.users; the role source of truth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Auto-provision a user_profiles row when a new auth.users row lands, so a
-- fresh sign-up doesn't 403 on /me before an admin gets around to seeding.
-- Lives in `internal`, not `public` — a trigger function has no business
-- being reachable as a PostgREST RPC endpoint, and triggers reference
-- functions by OID so the schema move doesn't affect the trigger below.
CREATE OR REPLACE FUNCTION internal.trg_auto_provision_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'viewer'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_after_insert ON auth.users;
CREATE TRIGGER trg_auth_users_after_insert
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION internal.trg_auto_provision_user_profile();

-- The authoritative role resolver every RLS policy calls. STABLE +
-- SECURITY DEFINER: runs as the function owner so it can read
-- user_profiles even under RLS, and its return value is stable within a
-- statement so Postgres can cache it during policy evaluation. Stays in
-- public and callable by authenticated: it only ever returns the caller's
-- own role, so its PostgREST exposure is intentional, not a gap (unlike
-- record_audit / next_*_number below, which write or allocate business
-- numbers and must never be a public RPC endpoint).
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_auth_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Master data — vendors, materials, products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL UNIQUE,
    legal_name VARCHAR(200),
    status vendor_status NOT NULL DEFAULT 'DRAFT',
    contact_email VARCHAR(150),
    phone VARCHAR(20),
    gstin VARCHAR(15),
    pan VARCHAR(10),
    payment_terms_days INT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    notes TEXT,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    -- live-DB reconciliation (see header note): soft-delete, added on the
    -- live database after the historical capture of this file.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_vendors_gstin_format
        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    CONSTRAINT chk_vendors_pan_format
        CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_deleted_at ON public.vendors(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    classification item_classification NOT NULL,
    uom VARCHAR(20) NOT NULL DEFAULT 'kg',
    hsn_code VARCHAR(20),
    safety_stock NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
    reorder_point NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    moq NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (moq > 0),
    lead_time_days INT NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
    is_hazardous BOOLEAN NOT NULL DEFAULT FALSE,
    status master_data_status NOT NULL DEFAULT 'ACTIVE',
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    -- live-DB reconciliation (see header note): soft-delete, added on the
    -- live database after the historical capture of this file.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_classification ON public.materials(classification);
CREATE INDEX IF NOT EXISTS idx_materials_deleted_at ON public.materials(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL UNIQUE,
    uom VARCHAR(20) NOT NULL DEFAULT 'units',
    pack_size NUMERIC(12,4),
    status master_data_status NOT NULL DEFAULT 'ACTIVE',
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    -- live-DB reconciliation (see header note): soft-delete, added on the
    -- live database after the historical capture of this file.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. BOM (read-model for procurement forecasting; write path lives in ERP)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    -- live-DB reconciliation (see header note): soft-delete, added on the
    -- live database after the historical capture of this file.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    CONSTRAINT uq_bom_product_version UNIQUE (product_id, version)
);
-- At most one active BOM per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_boms_one_active_per_product
    ON public.boms (product_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_boms_deleted_at ON public.boms(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    formula_percentage NUMERIC(6,3) NOT NULL CHECK (formula_percentage > 0 AND formula_percentage <= 100),
    standard_qty NUMERIC(18,4) NOT NULL CHECK (standard_qty > 0),
    uom VARCHAR(20) NOT NULL DEFAULT 'kg',
    CONSTRAINT uq_bom_material UNIQUE (bom_id, material_id)
);

-- ---------------------------------------------------------------------------
-- 4. MPN (material <-> vendor mapping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
    mpn_code VARCHAR(80) NOT NULL,
    specifications JSONB NOT NULL DEFAULT '{}'::JSONB,
    certifications TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_hazardous BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_approved BOOLEAN NOT NULL DEFAULT TRUE,
    is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
    moq NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (moq > 0),
    lead_time_days INT NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
    status master_data_status NOT NULL DEFAULT 'ACTIVE',
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    -- live-DB reconciliation (see header note): soft-delete, added on the
    -- live database after the historical capture of this file.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    CONSTRAINT uq_material_vendor UNIQUE (material_id, vendor_id),
    CONSTRAINT uq_vendor_mpn_code UNIQUE (vendor_id, mpn_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_vendors_one_preferred
    ON public.material_vendors (material_id) WHERE is_preferred = TRUE;
CREATE INDEX IF NOT EXISTS idx_material_vendors_material ON public.material_vendors(material_id);
CREATE INDEX IF NOT EXISTS idx_material_vendors_vendor ON public.material_vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_material_vendors_deleted_at
    ON public.material_vendors(deleted_at) WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Vendor pricing — effective-dated history, no overlaps allowed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_vendor_id UUID NOT NULL REFERENCES public.material_vendors(id) ON DELETE CASCADE,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    unit_price NUMERIC(18,4) NOT NULL CHECK (unit_price > 0),
    min_order_qty NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (min_order_qty > 0),
    valid_from DATE NOT NULL,
    valid_to DATE,
    source price_source NOT NULL DEFAULT 'QUOTE',
    notes TEXT,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_vendor_price_range CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT ex_vendor_prices_no_overlap EXCLUDE USING gist (
        material_vendor_id WITH =,
        daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[)') WITH &&
    )
);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_mv ON public.vendor_prices(material_vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_valid_from ON public.vendor_prices(valid_from DESC);

-- ---------------------------------------------------------------------------
-- 6. Purchase Requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_number VARCHAR(30) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    status pr_status NOT NULL DEFAULT 'DRAFT',
    required_by DATE NOT NULL,
    justification TEXT,
    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    decision_notes TEXT,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON public.purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_required_by ON public.purchase_requests(required_by);

CREATE TABLE IF NOT EXISTS public.purchase_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
    line_no INT NOT NULL CHECK (line_no > 0),
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    uom VARCHAR(20) NOT NULL DEFAULT 'kg',
    suggested_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    notes TEXT,
    CONSTRAINT uq_pr_line UNIQUE (pr_id, line_no)
);

-- ---------------------------------------------------------------------------
-- 7. Purchase Orders (one PO = one vendor) + line items + receipts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(30) NOT NULL UNIQUE,
    pr_id UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
    status po_status NOT NULL DEFAULT 'DRAFT',
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    subtotal NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_total NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
    grand_total NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
    expected_delivery_date DATE,
    issued_at TIMESTAMPTZ,
    issued_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(80) UNIQUE,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_pr ON public.purchase_orders(pr_id);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    line_no INT NOT NULL CHECK (line_no > 0),
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    material_vendor_id UUID REFERENCES public.material_vendors(id) ON DELETE SET NULL,
    quantity_ordered NUMERIC(18,4) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_price NUMERIC(18,4) NOT NULL CHECK (unit_price > 0),
    tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
    line_total NUMERIC(18,2) GENERATED ALWAYS AS
        (ROUND(quantity_ordered * unit_price * (1 + tax_percent / 100), 2)) STORED,
    CONSTRAINT uq_po_line UNIQUE (po_id, line_no),
    CONSTRAINT chk_po_receipt_within_ordered CHECK (quantity_received <= quantity_ordered)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
    po_item_id UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(30) NOT NULL,
    received_qty NUMERIC(18,4) NOT NULL CHECK (received_qty > 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    on_time BOOLEAN NOT NULL DEFAULT TRUE,
    quality_ok BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_po_item_receipt_number UNIQUE (po_item_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_po_receipts_po ON public.purchase_order_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_po_receipts_item ON public.purchase_order_receipts(po_item_id);

-- ---------------------------------------------------------------------------
-- 8. Audit log — SECURITY DEFINER writer, no direct INSERT policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action audit_action NOT NULL,
    actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_log(created_at DESC);

-- internal, not public: this writes audit_log rows as auth.uid() with a
-- caller-supplied entity_type/action/before/after. If it were reachable
-- as a PostgREST RPC, any signed-in user could forge arbitrary audit
-- history entries for any entity. Our backend calls it as
-- internal.record_audit(...) over its own direct asyncpg connection,
-- which needs only SCHEMA USAGE + EXECUTE — neither of which PostgREST's
-- exposed-schema routing grants it a path to.
CREATE OR REPLACE FUNCTION internal.record_audit(
    p_entity_type VARCHAR,
    p_entity_id UUID,
    p_action audit_action,
    p_before JSONB,
    p_after JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.audit_log(entity_type, entity_id, action, actor_id, before, after)
    VALUES (p_entity_type, p_entity_id, p_action, auth.uid(), p_before, p_after)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION internal.record_audit(VARCHAR, UUID, audit_action, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.record_audit(VARCHAR, UUID, audit_action, JSONB, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boms                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_vendors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_prices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log               ENABLE ROW LEVEL SECURITY;

-- Every auth.uid() / public.get_auth_role() call below is wrapped as
-- (select ...): a bare call is re-evaluated once PER ROW scanned, wrapped
-- it becomes a Postgres InitPlan evaluated ONCE per query (same predicate,
-- no behavior change — see docs/migrations/0004). Every table that needs
-- both a SELECT policy and admin writes gets separate INSERT/UPDATE/DELETE
-- policies rather than one FOR ALL, so exactly one permissive SELECT
-- policy applies per table instead of two being evaluated on every read.

-- user_profiles: self-read for everyone; admin sees all; admin can update role
CREATE POLICY user_profiles_self_or_admin_read ON public.user_profiles
    FOR SELECT TO authenticated
    USING (id = (select auth.uid()) OR public.get_auth_role() = 'admin');
CREATE POLICY user_profiles_admin_update ON public.user_profiles
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');

-- Master data: SELECT for all authenticated, WRITE for admin only
CREATE POLICY vendors_read ON public.vendors
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY vendors_admin_insert ON public.vendors
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY vendors_admin_update ON public.vendors
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY vendors_admin_delete ON public.vendors
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY materials_read ON public.materials
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY materials_admin_insert ON public.materials
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY materials_admin_update ON public.materials
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY materials_admin_delete ON public.materials
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY products_read ON public.products
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY products_admin_insert ON public.products
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY products_admin_update ON public.products
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY products_admin_delete ON public.products
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY boms_read ON public.boms
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY boms_admin_insert ON public.boms
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY boms_admin_update ON public.boms
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY boms_admin_delete ON public.boms
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY bom_items_read ON public.bom_items
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY bom_items_admin_insert ON public.bom_items
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY bom_items_admin_update ON public.bom_items
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY bom_items_admin_delete ON public.bom_items
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY mpn_read ON public.material_vendors
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY mpn_admin_insert ON public.material_vendors
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY mpn_admin_update ON public.material_vendors
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY mpn_admin_delete ON public.material_vendors
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY vendor_prices_read ON public.vendor_prices
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY vendor_prices_admin_insert ON public.vendor_prices
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY vendor_prices_admin_update ON public.vendor_prices
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY vendor_prices_admin_delete ON public.vendor_prices
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- Procurement: editors can create PRs and receipts; only admin can approve
-- PRs, issue POs, close POs.
CREATE POLICY pr_read ON public.purchase_requests
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY pr_editor_insert ON public.purchase_requests
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
-- editor may UPDATE only their own DRAFT PR (submit is UPDATE status -> SUBMITTED)
CREATE POLICY pr_editor_update_own_draft ON public.purchase_requests
    FOR UPDATE TO authenticated
    USING (
        (select public.get_auth_role()) IN ('admin', 'editor')
        AND (
            (select public.get_auth_role()) = 'admin'
            OR (created_by = (select auth.uid()) AND status IN ('DRAFT', 'SUBMITTED'))
        )
    )
    WITH CHECK (
        (select public.get_auth_role()) IN ('admin', 'editor')
        AND ((select public.get_auth_role()) = 'admin' OR created_by = (select auth.uid()))
    );
CREATE POLICY pr_admin_delete ON public.purchase_requests
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY pr_items_read ON public.purchase_request_items
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY pr_items_insert ON public.purchase_request_items
    FOR INSERT TO authenticated
    WITH CHECK (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    );
CREATE POLICY pr_items_update ON public.purchase_request_items
    FOR UPDATE TO authenticated
    USING (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    )
    WITH CHECK (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    );
CREATE POLICY pr_items_delete ON public.purchase_request_items
    FOR DELETE TO authenticated
    USING (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    );

CREATE POLICY po_read ON public.purchase_orders
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY po_admin_insert ON public.purchase_orders
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY po_admin_update ON public.purchase_orders
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY po_admin_delete ON public.purchase_orders
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY po_items_read ON public.purchase_order_items
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY po_items_admin_insert ON public.purchase_order_items
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY po_items_admin_update ON public.purchase_order_items
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY po_items_admin_delete ON public.purchase_order_items
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY po_receipts_read ON public.purchase_order_receipts
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY po_receipts_editor_insert ON public.purchase_order_receipts
    FOR INSERT TO authenticated
    WITH CHECK (
        (select public.get_auth_role()) IN ('admin', 'editor')
        AND created_by = (select auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = purchase_order_receipts.po_id
              AND po.status IN ('ISSUED', 'PARTIALLY_RECEIVED')
        )
    );

-- audit_log: read for all authenticated; no INSERT/UPDATE/DELETE policy at
-- all — writes flow only through internal.record_audit (SECURITY DEFINER).
CREATE POLICY audit_read ON public.audit_log
    FOR SELECT TO authenticated USING (TRUE);

-- ---------------------------------------------------------------------------
-- 10. Sequence generators for human-readable business numbers
-- internal, not public — same PostgREST-exposure reasoning as
-- internal.record_audit above: a signed-in user calling these directly
-- can't corrupt anything (they just read a MAX and return a formatted
-- string), but they serve no purpose outside the backend's own PR/PO/GRN
-- creation calls, so they get the same treatment on principle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.next_pr_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'PR-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(pr_number FROM '\d+$')::INT), 0) + 1
      INTO v_next
      FROM public.purchase_requests
     WHERE pr_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION internal.next_po_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'PO-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(po_number FROM '\d+$')::INT), 0) + 1
      INTO v_next
      FROM public.purchase_orders
     WHERE po_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION internal.next_grn_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'GRN-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(receipt_number FROM '\d+$')::INT), 0) + 1
      INTO v_next
      FROM public.purchase_order_receipts
     WHERE receipt_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

REVOKE ALL ON FUNCTION internal.next_pr_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.next_po_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.next_grn_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.next_pr_number() TO authenticated;
GRANT EXECUTE ON FUNCTION internal.next_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION internal.next_grn_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Targeted FK indexes (performance advisor) — only columns this app
-- actually filters/joins on. Deliberately NOT indexing every *_created_by /
-- *_updated_by / *_issued_by / *_closed_by / *_decided_by / *_submitted_by
-- audit-trail column — those are write-path provenance, never a WHERE/JOIN
-- key in this codebase's query patterns, and an unused index still costs
-- every future write on that table.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bom_items_material ON public.bom_items(material_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material ON public.purchase_order_items(material_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material_vendor ON public.purchase_order_items(material_vendor_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_material ON public.purchase_request_items(material_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_suggested_vendor ON public.purchase_request_items(suggested_vendor_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id);

-- ---------------------------------------------------------------------------
-- 12. Manufacturing/Inventory/Planning — new enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE inventory_txn_type AS ENUM (
        'INWARD_PURCHASE', 'OUTWARD_DISPOSAL', 'STOCK_ADJUSTMENT',
        'MFG_CONSUMPTION', 'MFG_PRODUCTION', 'DYNAMIC_RECONCILIATION'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE plan_status AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE batch_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 13. Locations & Warehouses (auto default-warehouse trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    address TEXT,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_location_wh_code UNIQUE (location_id, code)
);

-- Every location gets at least one warehouse automatically — invariant 6:
-- any code path that creates a locations row (including bulk import) goes
-- through this trigger, never a direct INSERT into warehouses "to save the
-- trigger the trouble".
CREATE OR REPLACE FUNCTION internal.trg_auto_create_default_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.warehouses (location_id, name, code, is_default, created_by)
    VALUES (NEW.id, 'Main Warehouse (WH-01)', 'WH-01', TRUE, NEW.created_by);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_after_insert ON public.locations;
CREATE TRIGGER trg_locations_after_insert
AFTER INSERT ON public.locations
FOR EACH ROW EXECUTE FUNCTION internal.trg_auto_create_default_warehouse();

-- ---------------------------------------------------------------------------
-- 14. Inventory Storage & Transaction Ledger (FEFO)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_number VARCHAR(100) NOT NULL,
    material_id UUID REFERENCES public.materials(id) ON DELETE RESTRICT,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    mfg_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    quantity_on_hand NUMERIC(18,4) NOT NULL DEFAULT 0,
    uom VARCHAR(20) NOT NULL DEFAULT 'kg',
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_material_or_product CHECK (
        (material_id IS NOT NULL AND product_id IS NULL) OR
        (material_id IS NULL AND product_id IS NOT NULL)
    ),
    CONSTRAINT chk_positive_qty CHECK (quantity_on_hand >= 0),
    CONSTRAINT uq_lot_in_warehouse UNIQUE (lot_number, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_lots_fefo
    ON public.inventory_lots(material_id, location_id, warehouse_id, expiry_date ASC);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID NOT NULL REFERENCES public.inventory_lots(id) ON DELETE RESTRICT,
    transaction_type inventory_txn_type NOT NULL,
    quantity NUMERIC(18,4) NOT NULL,
    balance_after NUMERIC(18,4) NOT NULL,
    reference_id VARCHAR(100),
    reason_notes TEXT,
    executed_by UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_txn_quantity_nonzero CHECK (quantity <> 0),
    CONSTRAINT chk_txn_balance_nonnegative CHECK (balance_after >= 0)
);
CREATE INDEX IF NOT EXISTS idx_inventory_txn_lot ON public.inventory_transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_txn_reference ON public.inventory_transactions(reference_id);
-- At most one FG-production post per batch, and at most one consumption
-- post per (batch, lot) pair — DB-enforced idempotency backstop, correctly
-- scoped per-lot (not per-material) to support multi-lot consumption.
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_mfg_production_per_batch
    ON public.inventory_transactions (reference_id) WHERE transaction_type = 'MFG_PRODUCTION';
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_consumption_per_batch_lot
    ON public.inventory_transactions (reference_id, lot_id) WHERE transaction_type = 'MFG_CONSUMPTION';

-- The ONLY code path allowed to write inventory_transactions or move
-- inventory_lots.quantity_on_hand. Does lock -> read -> validate -> insert
-- -> update as one atomic unit; INSERT/UPDATE on inventory_transactions are
-- revoked from `authenticated` below, so nothing else has privilege to
-- write it — this makes "the ledger is append-only and the sole source of
-- quantity_on_hand" true by grant, not just by service-layer convention.
CREATE OR REPLACE FUNCTION internal.post_inventory_transaction(
    p_lot_id UUID,
    p_transaction_type inventory_txn_type,
    p_quantity NUMERIC(18,4),
    p_reference_id VARCHAR(100),
    p_executed_by UUID,
    p_reason_notes TEXT DEFAULT NULL
) RETURNS public.inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lot public.inventory_lots%ROWTYPE;
    v_balance_after NUMERIC(18,4);
    v_txn public.inventory_transactions%ROWTYPE;
BEGIN
    -- SECURITY DEFINER bypasses RLS by design (runs as the function owner)
    -- so the role check must happen explicitly here.
    IF public.get_auth_role() NOT IN ('admin', 'editor') THEN
        RAISE EXCEPTION 'insufficient_privilege: ledger writes require admin or editor role'
            USING ERRCODE = '42501';
    END IF;

    IF p_executed_by IS NULL THEN
        RAISE EXCEPTION 'executed_by is required for every ledger write' USING ERRCODE = '23502';
    END IF;

    -- Lock -> read -> validate -> write, in that order (never read-then-lock).
    SELECT * INTO v_lot FROM public.inventory_lots WHERE id = p_lot_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % not found', p_lot_id USING ERRCODE = '23503';
    END IF;

    v_balance_after := v_lot.quantity_on_hand + p_quantity;

    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'insufficient_stock: lot % balance % + qty % = %',
            p_lot_id, v_lot.quantity_on_hand, p_quantity, v_balance_after
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.inventory_transactions (
        lot_id, transaction_type, quantity, balance_after, reference_id, reason_notes, executed_by
    ) VALUES (
        p_lot_id, p_transaction_type, p_quantity, v_balance_after, p_reference_id, p_reason_notes, p_executed_by
    )
    RETURNING * INTO v_txn;

    UPDATE public.inventory_lots
    SET quantity_on_hand = v_balance_after, updated_at = TIMEZONE('utc', NOW()), updated_by = p_executed_by
    WHERE id = p_lot_id;

    RETURN v_txn;
END;
$$;

REVOKE ALL ON FUNCTION internal.post_inventory_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.post_inventory_transaction TO authenticated;

-- Append-only, enforced at the grant level: no UPDATE/DELETE from the app
-- role at all, and no direct INSERT either — only the function above can
-- write this table.
REVOKE INSERT, UPDATE, DELETE ON public.inventory_transactions FROM authenticated;

-- ---------------------------------------------------------------------------
-- 15. Planning (Mandatory Logic Layer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_number VARCHAR(30) NOT NULL UNIQUE,
    status plan_status NOT NULL DEFAULT 'ACTIVE',
    idempotency_key VARCHAR(80) UNIQUE,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS public.plan_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    demand_target_qty NUMERIC(18,4) NOT NULL CHECK (demand_target_qty > 0),
    -- Supplied by the planner at plan-creation time rather than read off
    -- boms (which this migration deliberately never touches) — how many
    -- units one batch run is sized to produce. batches_required is purely
    -- informational (a reporting figure); it never feeds qty_required,
    -- which only needs bom_items.formula_percentage.
    batch_size_output NUMERIC(18,4) NOT NULL CHECK (batch_size_output > 0),
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE RESTRICT,
    batches_required INT NOT NULL CHECK (batches_required > 0),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_plan_product_location UNIQUE (plan_id, product_id, location_id)
);

-- ---------------------------------------------------------------------------
-- 16. Manufacturing (Batch Execution)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batch_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number VARCHAR(30) NOT NULL UNIQUE,
    -- Nullable: ad-hoc (off-plan) batches are supported, validated
    -- identically to plan-linked ones (tolerance, atomicity, FEFO, RBAC —
    -- no reduced-validation path).
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    planned_output_qty NUMERIC(18,4) NOT NULL CHECK (planned_output_qty > 0),
    actual_output_qty NUMERIC(18,4),
    output_variance_qty NUMERIC(18,4),
    output_variance_pct NUMERIC(5,2),
    output_variance_reason TEXT,
    mfg_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status batch_status NOT NULL DEFAULT 'SCHEDULED',
    executed_by VARCHAR(100) NOT NULL,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_completed_has_actual_output CHECK (
        (status = 'COMPLETED' AND actual_output_qty IS NOT NULL) OR
        (status <> 'COMPLETED' AND actual_output_qty IS NULL)
    ),
    CONSTRAINT chk_expiry_after_mfg CHECK (expiry_date > mfg_date)
);
CREATE INDEX IF NOT EXISTS idx_batch_records_plan ON public.batch_records(plan_id);
CREATE INDEX IF NOT EXISTS idx_batch_records_status ON public.batch_records(status);

CREATE TABLE IF NOT EXISTS public.batch_actual_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_record_id UUID NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    bom_percentage NUMERIC(6,3) NOT NULL,
    planned_input_qty NUMERIC(18,4) NOT NULL,
    actual_input_qty NUMERIC(18,4) NOT NULL,
    variance_pct NUMERIC(5,2) NOT NULL,
    variance_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_batch_input_per_material UNIQUE (batch_record_id, material_id)
);

-- Per-lot breakdown of one batch_actual_inputs row's consumption — one row
-- per distinct lot actually drawn from, since FEFO may split one
-- material's consumption across several lots rather than exactly one.
CREATE TABLE IF NOT EXISTS public.batch_actual_input_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_actual_input_id UUID NOT NULL REFERENCES public.batch_actual_inputs(id) ON DELETE CASCADE,
    consumed_lot_id UUID NOT NULL REFERENCES public.inventory_lots(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_batch_input_lot UNIQUE (batch_actual_input_id, consumed_lot_id)
);

-- ---------------------------------------------------------------------------
-- 17. Sequence generators for manufacturing/planning (internal — never PostgREST-exposed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.next_plan_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'PLAN-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(plan_number FROM '\d+$')::INT), 0) + 1
      INTO v_next FROM public.plans WHERE plan_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION internal.next_batch_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'BCH-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(batch_number FROM '\d+$')::INT), 0) + 1
      INTO v_next FROM public.batch_records WHERE batch_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

REVOKE ALL ON FUNCTION internal.next_plan_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.next_batch_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.next_plan_number() TO authenticated;
GRANT EXECUTE ON FUNCTION internal.next_batch_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- 18. Row Level Security for manufacturing/inventory/planning tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.locations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_actual_inputs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_actual_input_lots  ENABLE ROW LEVEL SECURITY;

-- Locations / Warehouses: read open to all authenticated, write admin-only
-- (same tier as other masters).
CREATE POLICY locations_read ON public.locations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY locations_admin_insert ON public.locations FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY locations_admin_update ON public.locations FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin') WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY locations_admin_delete ON public.locations FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY warehouses_read ON public.warehouses FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY warehouses_admin_insert ON public.warehouses FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY warehouses_admin_update ON public.warehouses FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin') WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY warehouses_admin_delete ON public.warehouses FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- Inventory lots: read open, write editor+ (matches ERP-SYSTEM's tier for
-- inventory-moving operations).
CREATE POLICY inventory_lots_read ON public.inventory_lots FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY inventory_lots_editor_insert ON public.inventory_lots FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY inventory_lots_editor_update ON public.inventory_lots FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- Inventory transactions: read open; no write policy at all — the only
-- writer is internal.post_inventory_transaction (SECURITY DEFINER), and
-- INSERT/UPDATE/DELETE are already revoked from authenticated above.
CREATE POLICY inventory_transactions_read ON public.inventory_transactions
    FOR SELECT TO authenticated USING (TRUE);

-- Plans: read open, write editor+.
CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY plans_editor_insert ON public.plans FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY plans_editor_update ON public.plans FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY plan_products_read ON public.plan_products FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY plan_products_editor_insert ON public.plan_products FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));

-- Batches: read open, write editor+ (full lifecycle: create/start/complete/cancel).
CREATE POLICY batch_records_read ON public.batch_records FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY batch_records_editor_insert ON public.batch_records FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY batch_records_editor_update ON public.batch_records FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY batch_actual_inputs_read ON public.batch_actual_inputs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY batch_actual_inputs_editor_insert ON public.batch_actual_inputs FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY batch_actual_inputs_editor_update ON public.batch_actual_inputs FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY batch_actual_input_lots_read ON public.batch_actual_input_lots
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY batch_actual_input_lots_editor_insert ON public.batch_actual_input_lots
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- 19. Additive column on products — the sole change to an existing VMS table
-- in this migration. Non-breaking: NOT NULL with a DEFAULT, so every
-- existing row (none yet, in practice) fills in automatically.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variance_tolerance_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00;

-- ---------------------------------------------------------------------------
-- 20. Least-privilege hardening for a pre-existing platform helper
-- ---------------------------------------------------------------------------
-- public.rls_auto_enable() is a Supabase-managed event-trigger function
-- (RETURNS event_trigger) installed by the dashboard's "Enforce RLS on new
-- tables" setting, not part of this project's own schema. New functions
-- default to EXECUTE granted to PUBLIC, which cascades to anon/authenticated;
-- no client role has a legitimate reason to call an event-trigger function
-- directly (Postgres only invokes it via the DDL event-trigger mechanism),
-- so this revoke is defensive least-privilege, silencing the security
-- advisor's WARN with no behavior change.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 12. New domains added on top of the 23-table base schema above:
-- quality control, MRP/planning, production orders, approval/workflow
-- engine, visitor/appointment, vendor contracts/performance/master, and
-- notifications/email. Each section below is copied verbatim from its
-- corresponding docs/migrations/00NN_*.sql file — see that file for the
-- full design-decision commentary (kept there rather than duplicated here
-- to avoid the two copies drifting in their prose while staying in sync on
-- the DDL itself, which is what actually needs to match).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0008_mrp_planning.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0008_mrp_planning.sql — MRP engine: run log + exploded planning requirements
--
-- Ordering note (applies to 0008-0014 as a group): these seven files extend
-- the 23-table schema captured in docs/schema.sql (materials/vendors/BOM/
-- inventory/purchasing/planning/batch-execution) with domains discovered by
-- auditing the Mongoose backend. They must apply in this order because later
-- files reference tables created by earlier ones:
--   0008 mrp_planning              (this file — no new cross-domain FKs)
--   0009 production_orders         (references mrp_runs from 0008)
--   0010 quality_control           (references production_orders from 0009)
--   0011 approval_workflow_engine  (no hard FK on production_orders; entity_id
--                                    is a generic pointer, same pattern as
--                                    public.audit_log)
--   0012 visitor_appointment
--   0013 vendor_contracts_performance_master
--   0014 notifications_email
--
-- Source: backend/models/MRPRun.js, backend/models/PlanningRequirement.js,
-- backend/services/mrpEngineService.js.
--
-- MRPRun.inputSnapshot / candidateProposal are Mongoose Mixed (arbitrary
-- JSON) -> kept as JSONB, not normalized, per explicit instruction.
-- MRPRun.exceptions[] and .parameters{} are also kept as JSONB (embedded,
-- variably-shaped). MRPRun.summary{} is a small *typed* subdocument (not
-- Mixed), so unlike the above it is normalized into flat columns below.
--
-- MRPRun is treated as an immutable execution log, like public.audit_log:
-- Mongoose gives it only createdAt (no updatedAt) and no createdBy (only
-- executedBy, optional) — mirrored here by omitting updated_at/updated_by
-- and the created_by-NOT-NULL convention used by mutable master-data tables.
-- Same reasoning applies to PlanningRequirement (createdAt only).
--
-- Judgment call: MRPRun.productId is named "productId" in Mongoose but its
-- `ref` is 'Material', not 'Product' — this repo's Postgres schema keeps
-- materials (raw/packaging inputs) and products (finished goods) as
-- separate tables, and an MRP run is computed FOR a material shortage
-- check, so the column here is named material_id to match what it actually
-- points to, not the Mongoose field's (misleading) name.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE mrp_run_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: exceptions[].severity ('INFO'|'WARNING'|'ERROR' in the Mongoose
-- source) stays inside the exceptions JSONB blob below rather than becoming
-- its own enum'd column — it's one field of a variable-shape embedded
-- array kept as JSONB by design (see exceptions column below), so no
-- top-level severity enum type is declared here.

DO $$ BEGIN
    CREATE TYPE planning_requirement_action AS ENUM (
        'SUFFICIENT', 'PROCURE', 'PRODUCE', 'PARTIAL_STOCK'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE planning_requirement_shortage_reason AS ENUM (
        'SUFFICIENT', 'INSUFFICIENT_STOCK', 'LATE_SUPPLY',
        'SAFETY_STOCK_REPLENISHMENT', 'MOQ_EFFECT', 'LOT_SIZE_ROUNDING',
        'MISSING_BOM', 'CIRCULAR_BOM'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE planning_requirement_status AS ENUM (
        'PENDING', 'CONVERTED_TO_PLAN', 'CONVERTED_TO_PO', 'DISMISSED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- mrp_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mrp_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number VARCHAR(30) NOT NULL UNIQUE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE RESTRICT,
    bom_version INT NOT NULL DEFAULT 1 CHECK (bom_version > 0),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    target_qty NUMERIC(18,4) NOT NULL CHECK (target_qty > 0),
    required_date DATE NOT NULL,
    horizon_days INT NOT NULL DEFAULT 30 CHECK (horizon_days >= 0),
    -- includeSafetyStock/applyLotSizing/multiLevel/demandIds[] flags — small
    -- and variably-shaped, kept as JSONB rather than four extra columns.
    parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
    algorithm_version VARCHAR(30) NOT NULL DEFAULT 'MRP-2.1',
    planning_rule_version VARCHAR(30) NOT NULL DEFAULT 'RULESET-1.4',
    idempotency_key VARCHAR(80),
    input_hash VARCHAR(128),
    -- Mongoose Mixed — immutable point-in-time snapshot / generated proposal.
    -- Never normalized: shape varies per run and is write-once.
    input_snapshot JSONB,
    candidate_proposal JSONB,
    status mrp_run_status NOT NULL DEFAULT 'COMPLETED',
    -- summary{} (typed subdocument, not Mixed) -> flat columns:
    summary_total_components INT,
    summary_total_shortages INT,
    summary_has_shortage BOOLEAN,
    summary_total_production_plans INT,
    summary_total_purchase_requirements INT,
    summary_ai_explanation TEXT,
    -- exceptions[] — embedded, variable-shape array of
    -- {code, materialId, materialName, message, severity} -> JSONB per
    -- instruction, not a child table.
    exceptions JSONB NOT NULL DEFAULT '[]'::JSONB,
    executed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_mrp_runs_created_at ON public.mrp_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrp_runs_material ON public.mrp_runs(material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrp_runs_warehouse ON public.mrp_runs(warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mrp_runs_idempotency_key
    ON public.mrp_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- MRPRun.warehouses[] (secondary/multi-warehouse scope for the run) — a
-- plain array-of-refs in Mongoose. Postgres arrays can't carry a real FK, so
-- this is a join table instead, preserving referential integrity.
CREATE TABLE IF NOT EXISTS public.mrp_run_warehouses (
    mrp_run_id UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    PRIMARY KEY (mrp_run_id, warehouse_id)
);

-- ---------------------------------------------------------------------------
-- planning_requirements — exploded per-material requirement lines for a run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planning_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mrp_run_id UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
    -- Idempotency key supplied by the engine (e.g. mrpRunId_materialId).
    source_key VARCHAR(150) NOT NULL UNIQUE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    -- Denormalized display snapshot, same as Mongoose (materialCode/Name are
    -- cached, not authoritative — material_id is the FK of record).
    material_code VARCHAR(50),
    material_name VARCHAR(150),
    unit VARCHAR(20),
    required_qty NUMERIC(18,4) NOT NULL,
    available_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
    reserved_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
    on_order_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
    net_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
    shortage_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
    suggested_lead_time_days INT NOT NULL DEFAULT 7 CHECK (suggested_lead_time_days >= 0),
    action planning_requirement_action NOT NULL DEFAULT 'SUFFICIENT',
    shortage_reason planning_requirement_shortage_reason NOT NULL DEFAULT 'SUFFICIENT',
    -- BOM explosion depth (1 = top-level component of the run's product).
    level INT NOT NULL DEFAULT 1 CHECK (level > 0),
    parent_material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
    parent_material_code VARCHAR(50),
    requirement_date DATE,
    release_date DATE,
    due_date DATE,
    -- trace{} — the engine's per-line arithmetic breakdown (grossRequiredQty,
    -- onHandQty, ... formula). Kept as JSONB: it exists purely for
    -- human/debug inspection of how netQty/shortageQty were derived, never
    -- queried or joined on.
    trace JSONB NOT NULL DEFAULT '{}'::JSONB,
    status planning_requirement_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_planning_requirements_mrp_run ON public.planning_requirements(mrp_run_id);
CREATE INDEX IF NOT EXISTS idx_planning_requirements_material_date
    ON public.planning_requirements(material_id, requirement_date);
CREATE INDEX IF NOT EXISTS idx_planning_requirements_parent_material
    ON public.planning_requirements(parent_material_id);

-- ---------------------------------------------------------------------------
-- internal.next_run_number() — same PostgREST-exposure reasoning as the
-- existing internal.next_pr_number()/next_po_number()/... generators.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.next_mrp_run_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'MRP-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(run_number FROM '\d+$')::INT), 0) + 1
      INTO v_next FROM public.mrp_runs WHERE run_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

REVOKE ALL ON FUNCTION internal.next_mrp_run_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.next_mrp_run_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.mrp_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_run_warehouses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_requirements  ENABLE ROW LEVEL SECURITY;

-- Read open to all authenticated (planning visibility), write editor+
-- (matches plans/batch_records tier — MRP runs are a planning artifact, not
-- financial/master data). No UPDATE policy on mrp_runs itself: the engine
-- writes a run once; only its status may legitimately change afterwards
-- (COMPLETED -> CONVERTED when a run is turned into plans/POs), so a scoped
-- UPDATE policy is provided rather than a blanket one.
CREATE POLICY mrp_runs_read ON public.mrp_runs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY mrp_runs_editor_insert ON public.mrp_runs FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY mrp_runs_editor_update ON public.mrp_runs FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY mrp_run_warehouses_read ON public.mrp_run_warehouses FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY mrp_run_warehouses_editor_insert ON public.mrp_run_warehouses FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY planning_requirements_read ON public.planning_requirements FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY planning_requirements_editor_insert ON public.planning_requirements FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY planning_requirements_editor_update ON public.planning_requirements FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0009_production_orders.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0009_production_orders.sql — Manufacturing execution orders (distinct from
-- the already-migrated public.plans/public.batch_records pair — see below).
--
-- Depends on 0008 (mrp_runs, for source_mrp_run_id). Must apply before 0010
-- (quality_control), which references production_orders.
--
-- Source: backend/models/ProductionOrder.js, backend/controllers/
-- productionController.js (read in full).
--
-- What ProductionOrder actually is (resolves the ambiguity the task flagged):
-- reading productionController.js's full lifecycle — createProductionOrder
-- (explodes a BOM into cost-priced component lines) -> submitForApproval ->
-- approveProductionOrder (soft-reserves each component's inventory in
-- sourceWarehouseId) -> allocateMaterial (hard lock) -> startProduction ->
-- sendToQC (records actual consumption/scrap/waste against the BOM
-- snapshot, creates a QualityRecord) -> completeProduction (on QC pass:
-- posts an Issue/consumption transaction for every component out of
-- sourceWarehouseId, then a production/receipt transaction for the
-- finished good into destinationWarehouseId||sourceWarehouseId) — is
-- unambiguously a BOM-driven manufacturing execution order: raw materials
-- are consumed from one warehouse and a finished good is produced into
-- another (or the same) warehouse, exactly like public.batch_records, but
-- with its own multi-stage approval/allocation/QC workflow that
-- batch_records does not have. It is NOT an inter-warehouse transfer order
-- — sourceWarehouseId/destinationWarehouseId/targetWarehouseId describe the
-- two sides of ONE manufacturing conversion (consume raw here, produce
-- finished good there), not a movement of the same SKU between two
-- warehouses.
--
-- FK design decision: bom_id -> public.boms(id), product_id ->
-- public.products(id) (Mongoose's productId ref is 'Material', but BOM in
-- this Postgres schema always produces a public.products row — see
-- public.boms.product_id — so the finished good this order produces is a
-- product, matching the already-migrated domain's own modeling choice, not
-- Mongoose's field name). plan_id -> public.plans(id) NULLABLE: a
-- production order MAY originate from a plan (mirrors batch_records.plan_id
-- allowing ad-hoc/off-plan orders), same nullable-FK pattern used there.
-- source_mrp_run_id -> public.mrp_runs(id) NULLABLE, since sourceMrpRunId is
-- optional lineage back to the MRP run that generated the demand.
--
-- Judgment call — four separate warehouse pointers: Mongoose's
-- ProductionOrderSchema literally carries warehouseId, sourceWarehouseId,
-- destinationWarehouseId AND targetWarehouseId as four independent refs
-- (apparent schema drift across iterations — getProductionOrders'
-- $or-filters across all four confirm the app still reads all of them).
-- Only sourceWarehouseId is `required` in Mongoose and it is the one
-- consumption transactions key off in completeProduction, so it is the only
-- NOT NULL warehouse FK here; the other three are preserved nullable for
-- fidelity rather than collapsed, since collapsing them risks silently
-- dropping data the live app still queries by.
--
-- Judgment call — isPerformanceTest / testRunId: EXCLUDED from this table.
-- These two fields exist only to flag rows created by load/performance test
-- scripts (createProductionOrder passes them straight from req.body with no
-- validation, and they gate nothing else in the business logic) — this
-- reads as test-data pollution in the Mongo collection, not a real business
-- attribute, so porting it as a real column would enshrine a testing
-- artifact into the production schema. Recommend leaving it out; flagging
-- explicitly here for reviewer sign-off per the task brief.
--
-- Judgment call — siteId: Mongoose's Site ref has no Postgres equivalent
-- table in this schema; the closest existing concept is public.locations
-- (see 0006's locations/warehouses split), so siteId -> location_id here,
-- nullable exactly as in Mongoose.
--
-- Judgment call — status enum: Mongoose's status enum is a flat list of
-- duplicated casings that accreted over time ('Draft','DRAFT','Scheduled',
-- 'SCHEDULED','In Progress','IN_PROGRESS','Completed','COMPLETED',
-- 'Cancelled','CANCELLED', plus 'Pending Approval','Approved','Material
-- Allocated','Quality Check','Closed' with no upper-snake twin). Canonicalized
-- here to one upper-snake-case value per lifecycle stage; an ETL step maps
-- every historical casing variant onto its canonical value.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE production_order_status AS ENUM (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'MATERIAL_ALLOCATED',
        'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'REJECTED',
        'CLOSED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- production_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_number VARCHAR(30) NOT NULL UNIQUE,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    source_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    source_plan_number VARCHAR(30),
    source_mrp_run_id UUID REFERENCES public.mrp_runs(id) ON DELETE SET NULL,
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    location_id UUID REFERENCES public.locations(id) ON DELETE RESTRICT,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    destination_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    target_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    target_quantity NUMERIC(18,4) NOT NULL CHECK (target_quantity > 0),
    actual_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    scrap_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0),
    waste_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (waste_quantity >= 0),
    yield_percent NUMERIC(6,2),
    waste_reason TEXT,
    variance_reason TEXT,
    batch_number VARCHAR(100),
    lot_number VARCHAR(100),
    mfg_date DATE,
    expiry_date DATE,
    status production_order_status NOT NULL DEFAULT 'DRAFT',
    expected_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    actual_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    material_variance NUMERIC(18,4) NOT NULL DEFAULT 0,
    cost_variance NUMERIC(18,2) NOT NULL DEFAULT 0,
    -- Optimistic concurrency: Mongoose has optimisticConcurrency:true on
    -- this model specifically (unlike most others in the source codebase),
    -- because approve/allocate/QC/complete are separate, racy write steps
    -- against the same document. Every UPDATE from the app must be
    -- `WHERE id = :id AND version = :expected_version` and bump version by
    -- 1, mirroring Mongoose's __v-style check.
    version INT NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    started_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    qc_approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_production_orders_expiry_after_mfg
        CHECK (mfg_date IS NULL OR expiry_date IS NULL OR expiry_date > mfg_date)
);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON public.production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_bom ON public.production_orders(bom_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_product ON public.production_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_source_warehouse ON public.production_orders(source_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_destination_warehouse ON public.production_orders(destination_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_plan ON public.production_orders(plan_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_created_at ON public.production_orders(created_at DESC);

-- ---------------------------------------------------------------------------
-- production_order_components — point-in-time BOM snapshot per order
-- (Mongoose POComponentSchema, embedded array `components`).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_order_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE RESTRICT,
    -- MPN (material<->vendor mapping) in this schema is public.material_vendors
    -- (see docs/schema.sql section "4. MPN"); Mongoose's `mpnId` maps here.
    mpn_id UUID REFERENCES public.material_vendors(id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(18,4) NOT NULL CHECK (expected_quantity >= 0),
    actual_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    consumed_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
    scrap_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0),
    loss_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (loss_percent >= 0 AND loss_percent < 100),
    expected_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    actual_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    variance_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT chk_poc_material_or_mpn CHECK (material_id IS NOT NULL OR mpn_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_production_order_components_order ON public.production_order_components(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_order_components_material ON public.production_order_components(material_id);
CREATE INDEX IF NOT EXISTS idx_production_order_components_mpn ON public.production_order_components(mpn_id);

-- ---------------------------------------------------------------------------
-- internal.next_prd_number()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.next_prd_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'PRD-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(prd_number FROM '\d+$')::INT), 0) + 1
      INTO v_next FROM public.production_orders WHERE prd_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

REVOKE ALL ON FUNCTION internal.next_prd_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.next_prd_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — same editor+ operational tier as batch_records
-- (full lifecycle: create/submit/approve/allocate/start/QC/complete is all
-- normal day-to-day shop-floor activity, not an admin-gated action).
-- ---------------------------------------------------------------------------
ALTER TABLE public.production_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_components   ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_orders_read ON public.production_orders FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY production_orders_editor_insert ON public.production_orders FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY production_orders_editor_update ON public.production_orders FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY production_order_components_read ON public.production_order_components
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY production_order_components_editor_insert ON public.production_order_components
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY production_order_components_editor_update ON public.production_order_components
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0010_quality_control.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0010_quality_control.sql — Quality inspection records, gating finished-goods
-- stock-in.
--
-- Depends on 0009 (production_orders). See 0008's header comment for the
-- full seven-file ordering rationale.
--
-- Source: backend/models/QualityRecord.js, backend/controllers/
-- qcController.js, backend/controllers/qualityController.js.
--
-- The Mongoose QualityRecord model itself is thin (productionOrderId unique,
-- status enum ['Pending','Passed','Failed','Rejected'], notes, inspectedBy,
-- createdAt) — no checkpoint/samples/specifications/measurements/defects
-- fields exist in the live Mongoose schema today. Those columns below are
-- an intentional, explicitly-flagged addition beyond 1:1 field-porting,
-- because the task brief calls for a proper QC-domain table shape (the kind
-- a manufacturing QMS needs) rather than a literal transcription of the
-- current 5-field stub. They are nullable/JSONB so they impose no
-- constraint on data ported from the existing thin Mongo documents.
--
-- disposition replaces Mongoose's 4-value `status` (folding "not yet
-- inspected" into the enum as PENDING rather than a separate nullable
-- status column) and expands it to the richer Pass/Fail/Rework/Scrap/Release
-- vocabulary the task asked for. Legal transitions (documented here, not
-- DB-enforced — no trigger, to avoid a second source of truth for workflow
-- rules the backend already owns):
--   PENDING -> PASS | FAIL           (initial inspection decision)
--   FAIL    -> REWORK | SCRAP        (disposition of a failed lot)
--   REWORK  -> PENDING                (re-submitted for re-inspection)
--   PASS    -> RELEASE                (stock actually released to FG available)
-- qcController.processQCInspection's 'Passed'/'Rejected' handling and
-- qualityController.inspectProduction's 'Passed'/'Failed' handling both map
-- onto PENDING -> PASS/FAIL; RELEASE and REWORK are the QMS states this
-- domain conceptually needs but the current stub controller code doesn't
-- yet expose a distinct endpoint for.
--
-- production_order_id is the sole hard link (unique, matching Mongoose's
-- unique productionOrderId — one inspection record per order). A separate
-- batch_record_id was deliberately NOT added: nothing in QualityRecord.js
-- or its controllers references public.batch_records or a Mongo batch
-- concept, so adding that FK would be inventing a relationship with no
-- source evidence, not translating one.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE quality_checkpoint AS ENUM ('INCOMING', 'IN_PROCESS', 'FINISHED_GOODS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE quality_disposition AS ENUM ('PENDING', 'PASS', 'FAIL', 'REWORK', 'SCRAP', 'RELEASE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- quality_records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
    checkpoint quality_checkpoint NOT NULL DEFAULT 'FINISHED_GOODS',
    disposition quality_disposition NOT NULL DEFAULT 'PENDING',
    -- Variable-shape structured data (differs per product/spec/checkpoint) —
    -- JSONB by design, not normalized into columns.
    samples JSONB NOT NULL DEFAULT '{}'::JSONB,
    specifications JSONB NOT NULL DEFAULT '{}'::JSONB,
    measurements JSONB NOT NULL DEFAULT '{}'::JSONB,
    defects JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Array of attachment URLs (photos, lab reports); no evidence of a
    -- dedicated file-storage table in this schema, so a JSONB array of
    -- URLs/paths is the lightest-weight faithful representation.
    attachments JSONB NOT NULL DEFAULT '[]'::JSONB,
    notes TEXT,
    inspector_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    dispositioned_at TIMESTAMPTZ,
    dispositioned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_quality_records_disposition_timing
        CHECK ((disposition = 'PENDING' AND dispositioned_at IS NULL) OR
               (disposition <> 'PENDING' AND dispositioned_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_quality_records_disposition ON public.quality_records(disposition);
CREATE INDEX IF NOT EXISTS idx_quality_records_checkpoint ON public.quality_records(checkpoint);
CREATE INDEX IF NOT EXISTS idx_quality_records_inspector ON public.quality_records(inspector_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — read open, write editor+ (QC inspectors/production
-- staff, same tier as batch_records/production_orders); disposition itself
-- (the actual pass/fail/release call) is still gated to editor+ rather than
-- a stricter admin-only tier, matching how completeProduction/QC endpoints
-- in the source app are not admin-restricted.
-- ---------------------------------------------------------------------------
ALTER TABLE public.quality_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY quality_records_read ON public.quality_records FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY quality_records_editor_insert ON public.quality_records FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY quality_records_editor_update ON public.quality_records FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0011_approval_workflow_engine.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0011_approval_workflow_engine.sql — Generic multi-step approval engine
-- (ApprovalWorkflow/ApprovalRequest) plus the separate low-code automation
-- engine (Workflow/WorkflowExecution/WorkflowLog).
--
-- No hard FK dependency on production_orders/quality_records: entity_type +
-- entity_id is a generic polymorphic pointer, the exact same pattern this
-- schema already uses for public.audit_log — deliberately NOT a real FK,
-- since a single approval_requests/workflow_executions table here fans out
-- across purchase_orders, purchase_requests, production_orders,
-- vendor_masters, boms, etc. Placed after 0010 only to keep the file
-- sequence matching the task's A-G domain ordering; could apply any time
-- after the base 23-table schema.
--
-- Source: backend/models/ApprovalRequest.js, backend/models/
-- ApprovalWorkflow.js, backend/models/Workflow.js, backend/models/
-- WorkflowExecution.js, backend/models/WorkflowLog.js (all read in full).
--
-- Two distinct engines exist in Mongoose and are kept distinct here:
--   1. ApprovalWorkflow/ApprovalRequest/ApprovalDecision — a config-driven
--      N-step sign-off chain (role + minApprovers + threshold per step).
--   2. Workflow/WorkflowExecution/WorkflowLog/WorkflowExecutionHistory — a
--      separate low-code automation engine triggered by domain events
--      (visitor.created, appointment.approved, etc.), whose step `config`
--      and execution `result`/`details` are genuinely free-form
--      (mongoose.Schema.Types.Mixed) and are kept as JSONB, not normalized,
--      per the task brief.
-- ============================================================================

DO $$ BEGIN
    -- Mirrors ApprovalWorkflowSchema.entityType's Mongoose enum exactly
    -- (PascalCase source values canonicalized to upper-snake-case, matching
    -- this schema's existing enum convention).
    CREATE TYPE approval_entity_type AS ENUM (
        'PURCHASE_ORDER', 'PURCHASE_REQUEST', 'PRODUCTION_ORDER',
        'VENDOR_MASTER', 'INVENTORY_ADJUSTMENT', 'BOM', 'PRODUCTION_PLAN'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE approval_request_status AS ENUM (
        'PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE approval_decision_action AS ENUM ('APPROVE', 'REJECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workflow_trigger_event AS ENUM (
        'visitor.created', 'visitor.updated', 'visitor.approved', 'visitor.rejected',
        'appointment.created', 'appointment.approved', 'appointment.rejected',
        'appointment.cancelled', 'visitor.checked_in', 'visitor.checked_out',
        'inventory.adjusted', 'production.completed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workflow_config_status AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workflow_step_type AS ENUM (
        'CONDITION', 'APPROVAL', 'EMAIL', 'DATABASE_UPDATE', 'DELAY', 'NOTIFICATION'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workflow_execution_status AS ENUM (
        'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workflow_log_status AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Engine 1: config-driven approval chains
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Mongoose: unique:true — one workflow config per entity type.
    entity_type approval_entity_type NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Mongoose createdBy is optional (not required); hardened to this
    -- schema's platform-wide created_by convention (NOT NULL DEFAULT
    -- auth.uid()) for consistency with every other admin-managed config
    -- table (vendors, materials, ...).
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS public.approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
    step_order INT NOT NULL CHECK (step_order > 0),
    -- Free text, not FK'd to user_role: Mongoose stores requiredRole as an
    -- unconstrained String, so this stays flexible rather than assuming it
    -- always equals one of this schema's three user_role enum values.
    required_role VARCHAR(50) NOT NULL,
    min_approvers INT NOT NULL DEFAULT 1 CHECK (min_approvers > 0),
    threshold_field VARCHAR(100),
    threshold_value NUMERIC(18,4),
    description TEXT DEFAULT '',
    CONSTRAINT uq_approval_steps_order UNIQUE (workflow_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_approval_steps_workflow ON public.approval_steps(workflow_id);

CREATE TABLE IF NOT EXISTS public.approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE RESTRICT,
    entity_type approval_entity_type NOT NULL,
    -- Generic polymorphic pointer, same non-FK pattern as public.audit_log's
    -- (entity_type, entity_id) — the referenced row can live in any of the
    -- entity_type tables above, so no single FK target is possible.
    entity_id UUID NOT NULL,
    current_step INT NOT NULL DEFAULT 1 CHECK (current_step > 0),
    status approval_request_status NOT NULL DEFAULT 'PENDING',
    requested_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON public.approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status);

CREATE TABLE IF NOT EXISTS public.approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    action approval_decision_action NOT NULL,
    step_order INT NOT NULL CHECK (step_order > 0),
    reason TEXT DEFAULT '',
    ip_address INET,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_request ON public.approval_decisions(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_user ON public.approval_decisions(user_id);

-- ---------------------------------------------------------------------------
-- Engine 2: low-code event-triggered automation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    trigger_event workflow_trigger_event NOT NULL,
    status workflow_config_status NOT NULL DEFAULT 'ACTIVE',
    version INT NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_event ON public.workflows(trigger_event);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON public.workflows(status);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    step_order INT NOT NULL CHECK (step_order > 0),
    name VARCHAR(150) NOT NULL,
    type workflow_step_type NOT NULL,
    -- Mongoose Mixed, required — arbitrary per-step-type config payload
    -- (email template vars, condition expression, DB update spec, delay
    -- duration, ...). Never normalized.
    config JSONB NOT NULL,
    CONSTRAINT uq_workflow_steps_order UNIQUE (workflow_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON public.workflow_steps(workflow_id);

CREATE TABLE IF NOT EXISTS public.workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE RESTRICT,
    -- Free text, not the workflow_trigger_event enum: an execution row must
    -- remain readable even if the workflow's own trigger_event definition
    -- changes after the fact (this is a historical record of what actually
    -- fired it).
    trigger_event VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    status workflow_execution_status NOT NULL DEFAULT 'RUNNING',
    current_step_index INT NOT NULL DEFAULT 0 CHECK (current_step_index >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    completed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_entity ON public.workflow_executions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);

-- Embedded executionHistory[] on WorkflowExecution -> child table.
CREATE TABLE IF NOT EXISTS public.workflow_execution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_execution_id UUID NOT NULL REFERENCES public.workflow_executions(id) ON DELETE CASCADE,
    step_order INT,
    step_name VARCHAR(150),
    -- Free text per-step status snapshot in Mongoose (untyped String, not
    -- the workflow_execution_status enum) — kept as-is.
    status VARCHAR(30),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    result JSONB,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_history_execution
    ON public.workflow_execution_history(workflow_execution_id);

CREATE TABLE IF NOT EXISTS public.workflow_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    execution_id UUID NOT NULL REFERENCES public.workflow_executions(id) ON DELETE CASCADE,
    step_name VARCHAR(150) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    status workflow_log_status NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_workflow_logs_workflow ON public.workflow_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_logs_execution ON public.workflow_logs(execution_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.approval_workflows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_execution_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs               ENABLE ROW LEVEL SECURITY;

-- Workflow/approval CONFIGURATION (the chain definitions themselves) is
-- admin-only to write, same tier as other master-data config in this
-- schema — read open to all authenticated.
CREATE POLICY approval_workflows_read ON public.approval_workflows FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY approval_workflows_admin_insert ON public.approval_workflows FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY approval_workflows_admin_update ON public.approval_workflows FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY approval_workflows_admin_delete ON public.approval_workflows FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY approval_steps_read ON public.approval_steps FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY approval_steps_admin_insert ON public.approval_steps FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY approval_steps_admin_update ON public.approval_steps FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin') WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY approval_steps_admin_delete ON public.approval_steps FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- Approval REQUESTS/DECISIONS are transactional business activity raised by
-- any editor+ user in the course of normal work (submitting a PO/PR/etc for
-- sign-off, or recording their own decision on a pending step).
CREATE POLICY approval_requests_read ON public.approval_requests FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY approval_requests_editor_insert ON public.approval_requests FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND requested_by = (select auth.uid()));
CREATE POLICY approval_requests_editor_update ON public.approval_requests FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY approval_decisions_read ON public.approval_decisions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY approval_decisions_editor_insert ON public.approval_decisions FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND user_id = (select auth.uid()));

-- Automation-engine CONFIGURATION (workflows/workflow_steps): admin-only,
-- same as approval_workflows.
CREATE POLICY workflows_read ON public.workflows FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY workflows_admin_insert ON public.workflows FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY workflows_admin_update ON public.workflows FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin') WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY workflows_admin_delete ON public.workflows FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY workflow_steps_read ON public.workflow_steps FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY workflow_steps_admin_insert ON public.workflow_steps FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY workflow_steps_admin_update ON public.workflow_steps FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin') WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY workflow_steps_admin_delete ON public.workflow_steps FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- Automation-engine RUNTIME rows (executions/history/logs) are system-
-- generated as a side effect of event triggers firing — editor+ write,
-- matching every other operational-log table in this schema (no dedicated
-- SECURITY DEFINER writer exists for this domain, unlike inventory_transactions).
CREATE POLICY workflow_executions_read ON public.workflow_executions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY workflow_executions_editor_insert ON public.workflow_executions FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY workflow_executions_editor_update ON public.workflow_executions FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY workflow_execution_history_read ON public.workflow_execution_history
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY workflow_execution_history_editor_insert ON public.workflow_execution_history
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY workflow_logs_read ON public.workflow_logs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY workflow_logs_editor_insert ON public.workflow_logs FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0012_visitor_appointment.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0012_visitor_appointment.sql — Site visitor registration/check-in and host
-- appointment scheduling.
--
-- Source: backend/models/Visitor.js, backend/models/Appointment.js (read in
-- full). No dependency on 0008-0011; depends only on the base 23-table
-- schema (public.locations, public.warehouses, public.user_profiles).
--
-- Judgment call — Site -> locations: Mongoose's Visitor/Appointment models
-- reference a `Site` collection that has no equivalent table in this
-- Postgres schema. The closest existing concept is public.locations (a
-- physical site, per 0006's "Locations & Warehouses" section), so
-- siteId -> location_id throughout this file.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE visitor_status AS ENUM (
        'REGISTERED', 'REQUESTED', 'APPROVED', 'SCHEDULED', 'EXPECTED',
        'CHECKED_IN', 'IN_VISIT', 'CHECKED_OUT', 'REJECTED', 'NO_SHOW', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'DRAFT', 'REQUESTED', 'APPROVED', 'SCHEDULED', 'EXPECTED', 'CHECKED_IN',
        'IN_VISIT', 'CHECKED_OUT', 'RESCHEDULED', 'REJECTED', 'NO_SHOW', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- visitors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_code VARCHAR(30) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    company VARCHAR(150) NOT NULL DEFAULT '',
    government_id VARCHAR(50) NOT NULL DEFAULT '',
    host_employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    status visitor_status NOT NULL DEFAULT 'REGISTERED',
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    badge_number VARCHAR(30) NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_visitors_checkout_after_checkin
        CHECK (check_out_time IS NULL OR check_in_time IS NULL OR check_out_time >= check_in_time)
);
CREATE INDEX IF NOT EXISTS idx_visitors_email ON public.visitors(email);
CREATE INDEX IF NOT EXISTS idx_visitors_host_employee ON public.visitors(host_employee_id);
CREATE INDEX IF NOT EXISTS idx_visitors_location ON public.visitors(location_id);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON public.visitors(status);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_number VARCHAR(30) NOT NULL UNIQUE,
    visitor_id UUID NOT NULL REFERENCES public.visitors(id) ON DELETE RESTRICT,
    host_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    scheduled_start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ NOT NULL,
    purpose TEXT NOT NULL,
    status appointment_status NOT NULL DEFAULT 'REQUESTED',
    approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    approval_notes TEXT NOT NULL DEFAULT '',
    approval_time TIMESTAMPTZ,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_appointments_end_after_start CHECK (scheduled_end_time > scheduled_start_time)
);
CREATE INDEX IF NOT EXISTS idx_appointments_visitor ON public.appointments(visitor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_host_user ON public.appointments(host_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_location ON public.appointments(location_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_start ON public.appointments(scheduled_start_time);

-- ---------------------------------------------------------------------------
-- internal.next_visitor_code() / internal.next_appointment_number()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.next_visitor_code() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'VIS-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(visitor_code FROM '\d+$')::INT), 0) + 1
      INTO v_next FROM public.visitors WHERE visitor_code LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION internal.next_appointment_number() RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prefix VARCHAR := 'APT-' || to_char(NOW() AT TIME ZONE 'utc', 'YYYYMM') || '-';
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(appointment_number FROM '\d+$')::INT), 0) + 1
      INTO v_next FROM public.appointments WHERE appointment_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 5, '0');
END; $$;

REVOKE ALL ON FUNCTION internal.next_visitor_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.next_appointment_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.next_visitor_code() TO authenticated;
GRANT EXECUTE ON FUNCTION internal.next_appointment_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — read open, write editor+ (front-desk/reception and
-- host employees are normal operational users, not admin-gated).
-- ---------------------------------------------------------------------------
ALTER TABLE public.visitors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY visitors_read ON public.visitors FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY visitors_editor_insert ON public.visitors FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY visitors_editor_update ON public.visitors FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY appointments_read ON public.appointments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY appointments_editor_insert ON public.appointments FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY appointments_editor_update ON public.appointments FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0013_vendor_contracts_performance_master.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0013_vendor_contracts_performance_master.sql — Vendor contracts,
-- performance ratings, and the separate vendor-onboarding "VendorMaster"
-- entity.
--
-- Source: backend/models/Contract.js, backend/models/PerformanceRating.js,
-- backend/models/VendorMaster.js, backend/controllers/
-- vendorMasterController.js (read for duplicate-check/soft-delete
-- semantics). No dependency on 0008-0012; depends only on the base
-- 23-table schema (public.vendors, public.user_profiles).
--
-- vendor_masters is CONFIRMED (per task brief + controller inspection) to
-- be a genuinely separate, live entity from public.vendors — it backs its
-- own mounted route (/api/vendor-masters), does its own duplicate-checking
-- on Vendor_ID/Tax_ID scoped to non-deleted rows, and represents a vendor
-- onboarding/master-data record that may later become a full public.vendors
-- row (no such conversion FK exists in the Mongoose model itself, so none
-- is added here — see comment on the table below).
--
-- Judgment call — VendorMaster field-name casing: Mongoose uses
-- PascalCase/underscore field names (Vendor_ID, Company_Name, Tax_ID,
-- Contact_Email, Department, Role, Status) inconsistent with the rest of
-- this codebase's camelCase convention — an artifact of how this
-- collection was originally built. Columns below use this schema's normal
-- snake_case, with the Mongoose source field name noted per-column so the
-- ETL mapping is traceable.
--
-- Judgment call — is_deleted -> deleted_at/deleted_by: VendorMaster's
-- source model uses a plain boolean is_deleted flag, but every other
-- soft-deletable table in this Postgres schema (materials, vendors,
-- material_vendors, boms, products — see backend/prisma/schema.prisma,
-- the live introspected ground truth) uses the deleted_at/deleted_by
-- convention instead of a boolean, which additionally records *when* and
-- *by whom*. Adopted here for consistency; is_deleted's app-level meaning
-- is preserved as `deleted_at IS NOT NULL`.
--
-- Judgment call — `Role` (both VendorMaster.Role and its embedded
-- contacts[].role): renamed to role_title / contact_role respectively.
-- Plain `role` is not a reserved word in Postgres, but this schema already
-- has a `user_role` enum type and a `user_profiles.role` column with a very
-- different meaning (platform RBAC role); reusing the bare name `role` here
-- for an unrelated free-text vendor-contact job title invites confusion, so
-- it is renamed instead of overloaded.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE contract_status AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- vendor_contracts (Mongoose model: Contract)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status contract_status NOT NULL DEFAULT 'PENDING',
    value NUMERIC(18,2) NOT NULL CHECK (value >= 0),
    document_url TEXT NOT NULL DEFAULT '',
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    -- Mirrors ContractSchema.pre('validate'): startDate >= endDate is invalid.
    CONSTRAINT chk_vendor_contracts_end_after_start CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_vendor_contracts_vendor ON public.vendor_contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contracts_status ON public.vendor_contracts(status);
CREATE INDEX IF NOT EXISTS idx_vendor_contracts_end_date ON public.vendor_contracts(end_date);

-- ---------------------------------------------------------------------------
-- vendor_performance_ratings (Mongoose model: PerformanceRating) — an
-- append-only rating log, mirrored on public.audit_log's minimalist shape
-- (createdAt only in Mongoose, no update path, so no updated_at/updated_by
-- here either).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_performance_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT NOT NULL,
    rated_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_vendor_performance_ratings_vendor ON public.vendor_performance_ratings(vendor_id);

-- ---------------------------------------------------------------------------
-- vendor_masters (Mongoose model: VendorMaster)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_masters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id_code VARCHAR(50) NOT NULL,     -- Mongoose: Vendor_ID
    company_name VARCHAR(200) NOT NULL,      -- Mongoose: Company_Name
    tax_id VARCHAR(50) NOT NULL,             -- Mongoose: Tax_ID
    contact_email VARCHAR(150) NOT NULL,     -- Mongoose: Contact_Email
    department VARCHAR(100) NOT NULL DEFAULT '',  -- Mongoose: Department
    role_title VARCHAR(100) NOT NULL DEFAULT '',  -- Mongoose: Role
    status master_data_status NOT NULL DEFAULT 'ACTIVE',  -- Mongoose: Status
    -- Mongoose: is_deleted (boolean) -> deleted_at IS NOT NULL, see header.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_vendor_masters_contact_email
        CHECK (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
-- Mirrors the app-level duplicate check in vendorMasterController.js: active
-- (non-deleted) Vendor_ID/Tax_ID values must be unique, but a soft-deleted
-- row's values may coexist with (or be reused by) an active one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_masters_vendor_id_active
    ON public.vendor_masters(vendor_id_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_masters_tax_id_active
    ON public.vendor_masters(tax_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_masters_deleted_at
    ON public.vendor_masters(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_masters_status ON public.vendor_masters(status);

-- Embedded contacts[] on VendorMaster -> child table.
CREATE TABLE IF NOT EXISTS public.vendor_master_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_master_id UUID NOT NULL REFERENCES public.vendor_masters(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL DEFAULT '',
    phone VARCHAR(20) NOT NULL DEFAULT '',
    contact_role VARCHAR(50) NOT NULL DEFAULT 'Other',   -- Mongoose: role
    department VARCHAR(50) NOT NULL DEFAULT 'Sourcing',
    email VARCHAR(150) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vendor_master_contacts_vendor_master
    ON public.vendor_master_contacts(vendor_master_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_performance_ratings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_masters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_master_contacts      ENABLE ROW LEVEL SECURITY;

-- Contracts/ratings: read open, write editor+ (procurement staff tier,
-- same as purchase_requests — not the stricter admin-only tier
-- public.vendors itself uses, since these are day-to-day procurement
-- activity rather than master-data changes to the vendor record itself).
CREATE POLICY vendor_contracts_read ON public.vendor_contracts FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY vendor_contracts_editor_insert ON public.vendor_contracts FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY vendor_contracts_editor_update ON public.vendor_contracts FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY vendor_contracts_admin_delete ON public.vendor_contracts FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY vendor_performance_ratings_read ON public.vendor_performance_ratings
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY vendor_performance_ratings_editor_insert ON public.vendor_performance_ratings
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND rated_by = (select auth.uid()));

-- vendor_masters: onboarding/master data — editor+ can create/update (the
-- procurement/vendor-onboarding staff tier), admin-only can hard-restore
-- from soft-delete or delete outright, consistent with how this schema
-- treats "who may mutate a soft-delete flag" elsewhere (materials/vendors
-- restrict DELETE to admin, though those use application-level soft-delete
-- via UPDATE rather than a real DELETE).
CREATE POLICY vendor_masters_read ON public.vendor_masters FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY vendor_masters_editor_insert ON public.vendor_masters FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));
CREATE POLICY vendor_masters_editor_update ON public.vendor_masters FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY vendor_masters_admin_delete ON public.vendor_masters FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

CREATE POLICY vendor_master_contacts_read ON public.vendor_master_contacts FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY vendor_master_contacts_editor_insert ON public.vendor_master_contacts FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY vendor_master_contacts_editor_update ON public.vendor_master_contacts FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY vendor_master_contacts_editor_delete ON public.vendor_master_contacts FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- source: docs/migrations/0014_notifications_email.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- 0014_notifications_email.sql — In-app notifications, outbound email queue/
-- log, and email templates.
--
-- Source: backend/models/Notification.js, backend/models/EmailLog.js,
-- backend/models/EmailQueue.js, backend/models/EmailTemplate.js (all read
-- in full; EmailQueue does exist as its own distinct model, separate from
-- EmailLog). No dependency on 0008-0013; depends only on the base
-- 23-table schema (public.user_profiles).
--
-- Judgment call — Mongo's status enums for Notification.recipientRole,
-- EmailLog.status and EmailQueue.status all carry accreted
-- duplicate-casing/duplicate-meaning values from iterative development
-- (e.g. EmailQueue.status: ['Pending','QUEUED','Sending','PROCESSING',
-- 'Sent','SENT','Failed','FAILED','Retrying','RETRYING']). Each is
-- canonicalized below to one clean upper-snake-case enum; an ETL step maps
-- every historical variant onto its canonical value. EmailLog keeps two
-- extra states (DELIVERED, BOUNCED) that EmailQueue's source enum doesn't
-- have, so they are two distinct enum types, not a shared one.
--
-- Judgment call — Notification.read (boolean) -> is_read: `read` is a valid
-- Postgres column name but reads awkwardly next to this schema's is_active/
-- is_default/is_preferred boolean-naming convention, so it is renamed for
-- consistency; the Mongo field name is noted inline.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'NEW_REGISTRATION', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'ROLE_CHANGED',
        'SCOPE_CHANGED', 'PENDING_APPROVAL', 'ACCESS_REMOVED',
        'ACCESS_TRANSFERRED', 'SYSTEM_ALERT'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE notification_severity AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    -- Canonicalizes Mongo's ['Admin','admin','approver','all',null] into a
    -- clean 3-value enum; NULL (targeted-only via recipient_user_id, no
    -- role broadcast) remains a valid column state since the column stays
    -- nullable.
    CREATE TYPE notification_recipient_role AS ENUM ('ADMIN', 'APPROVER', 'ALL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE email_log_status AS ENUM (
        'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'BOUNCED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE email_queue_status AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE email_template_category AS ENUM ('VISITOR', 'APPOINTMENT', 'WORKFLOW', 'SYSTEM', 'NOTIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    recipient_role notification_recipient_role,
    type notification_type NOT NULL,
    title VARCHAR(150) NOT NULL DEFAULT 'System Notification',
    message TEXT NOT NULL,
    related_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    -- Mongoose Mixed, default {} — arbitrary per-notification-type payload.
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    severity notification_severity NOT NULL DEFAULT 'INFO',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,   -- Mongoose: read
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT chk_notifications_has_target
        CHECK (recipient_user_id IS NOT NULL OR recipient_role IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user
    ON public.notifications(recipient_user_id, is_read, created_at DESC) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
    ON public.notifications(recipient_role, is_read, created_at DESC) WHERE recipient_role IS NOT NULL;

-- ---------------------------------------------------------------------------
-- email_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT NOT NULL DEFAULT '',
    variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    category email_template_category NOT NULL DEFAULT 'VISITOR',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates(category);

-- ---------------------------------------------------------------------------
-- email_queue (EmailQueue — pending outbound mail, pre-send)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100),
    event_type VARCHAR(50),
    recipient VARCHAR(255) NOT NULL,
    cc TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    bcc TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    subject VARCHAR(255) NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT NOT NULL DEFAULT '',
    template_code VARCHAR(50) REFERENCES public.email_templates(template_code) ON DELETE SET NULL,
    template_data JSONB,
    status email_queue_status NOT NULL DEFAULT 'QUEUED',
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    error_log TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    delivery_status VARCHAR(50),
    next_retry_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_for ON public.email_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_queue_event_id ON public.email_queue(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_queue_recipient ON public.email_queue(recipient);

-- ---------------------------------------------------------------------------
-- email_log (EmailLog — record of an actually-attempted/sent email)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100),
    event_type VARCHAR(50),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    template_code VARCHAR(50) REFERENCES public.email_templates(template_code) ON DELETE SET NULL,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    status email_log_status NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    delivered_at TIMESTAMPTZ,
    message_id VARCHAR(150),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    error TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_email_log_event_id ON public.email_log(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_event_type ON public.email_log(event_type);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON public.email_log(recipient);
CREATE INDEX IF NOT EXISTS idx_email_log_user ON public.email_log(user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log        ENABLE ROW LEVEL SECURITY;

-- Notifications are personal: a user sees their own targeted notifications,
-- or any role-broadcast one matching their own role (ALL matches everyone,
-- ADMIN/APPROVER match admin/editor respectively — this schema's user_role
-- enum has no literal 'approver' value, so APPROVER is mapped onto the
-- admin+editor tier as the closest equivalent). Only admin may INSERT
-- (create a notification targeting someone else / a role broadcast) —
-- letting arbitrary editor users raise notifications addressed to other
-- users or broadcast to a role would let any operational user impersonate
-- a system alert. A user may UPDATE (mark read) only their own row.
CREATE POLICY notifications_read ON public.notifications
    FOR SELECT TO authenticated
    USING (
        recipient_user_id = (select auth.uid())
        OR (recipient_role = 'ALL')
        OR (recipient_role = 'ADMIN' AND (select public.get_auth_role()) = 'admin')
        OR (recipient_role = 'APPROVER' AND (select public.get_auth_role()) IN ('admin', 'editor'))
        OR (select public.get_auth_role()) = 'admin'
    );
CREATE POLICY notifications_admin_insert ON public.notifications FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY notifications_own_update ON public.notifications FOR UPDATE TO authenticated
    USING (recipient_user_id = (select auth.uid()) OR (select public.get_auth_role()) = 'admin')
    WITH CHECK (recipient_user_id = (select auth.uid()) OR (select public.get_auth_role()) = 'admin');

-- Email templates: master data — read open, write admin only.
CREATE POLICY email_templates_read ON public.email_templates FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY email_templates_admin_insert ON public.email_templates FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY email_templates_admin_update ON public.email_templates FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin') WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY email_templates_admin_delete ON public.email_templates FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- Email queue/log: system-generated operational tables (no interactive
-- authoring UI in the source app — rows are written by the mail-sending
-- service as a side effect of other actions), so read is open and write is
-- editor+, matching this schema's treatment of every other
-- backend-service-populated operational log that doesn't have a dedicated
-- SECURITY DEFINER writer function.
CREATE POLICY email_queue_read ON public.email_queue FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY email_queue_editor_insert ON public.email_queue FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY email_queue_editor_update ON public.email_queue FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));

CREATE POLICY email_log_read ON public.email_log FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY email_log_editor_insert ON public.email_log FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
CREATE POLICY email_log_editor_update ON public.email_log FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) IN ('admin', 'editor'))
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor'));
