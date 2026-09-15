-- ============================================================================
-- Vendor Management System — Production Database Schema (Supabase PostgreSQL)
-- Single-source-of-truth for a fresh deployment. Numbered migrations under
-- docs/migrations/ apply the same DDL incrementally against an existing DB
-- and must be kept in sync with this file.
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
    CONSTRAINT chk_vendors_gstin_format
        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    CONSTRAINT chk_vendors_pan_format
        CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors(status);

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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_materials_classification ON public.materials(classification);

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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

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
    CONSTRAINT uq_bom_product_version UNIQUE (product_id, version)
);
-- At most one active BOM per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_boms_one_active_per_product
    ON public.boms (product_id) WHERE is_active = TRUE;

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
    CONSTRAINT uq_material_vendor UNIQUE (material_id, vendor_id),
    CONSTRAINT uq_vendor_mpn_code UNIQUE (vendor_id, mpn_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_vendors_one_preferred
    ON public.material_vendors (material_id) WHERE is_preferred = TRUE;
CREATE INDEX IF NOT EXISTS idx_material_vendors_material ON public.material_vendors(material_id);
CREATE INDEX IF NOT EXISTS idx_material_vendors_vendor ON public.material_vendors(vendor_id);

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
