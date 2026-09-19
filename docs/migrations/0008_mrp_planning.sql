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
-- financial/master data). The engine writes a run once; only its status
-- legitimately changes afterwards (COMPLETED -> CONVERTED when a run is
-- turned into plans/POs), so the UPDATE policy below covers that narrow
-- case rather than opening the whole row to arbitrary edits.
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
