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
