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
