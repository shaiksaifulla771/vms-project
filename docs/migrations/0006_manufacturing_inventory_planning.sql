-- ============================================================================
-- Manufacturing, Inventory & Planning — Locations/Warehouses, Inventory
-- Lots + append-only Transaction Ledger (FEFO), Planning, Batch Execution,
-- Dynamic IP/OP Correction. Mirrors the design proven in the sibling
-- ERP-SYSTEM ("BatchCore") repo, adapted to this project's conventions:
-- NUMERIC(18,4), UUID PK + separate business-number column on every table,
-- created_by/updated_by everywhere, and the wrapped-select RLS pattern
-- applied from the start (see 0004's comment for why).
--
-- Does not modify vendors, materials, material_vendors, boms, or bom_items
-- in any way. The one exception is an additive column on products
-- (variance_tolerance_percent) — see section 7.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. New enums
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
-- 1. Locations & Warehouses (auto default-warehouse trigger)
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
-- 2. Inventory Storage & Transaction Ledger (FEFO)
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
-- 3. Planning (Mandatory Logic Layer)
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
-- 4. Manufacturing (Batch Execution)
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
-- 5. Sequence generators (internal — never PostgREST-exposed)
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
-- 6. Row Level Security
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
-- 7. Additive column on products — the sole change to an existing VMS table
-- in this migration. Non-breaking: NOT NULL with a DEFAULT, so every
-- existing row (none yet, in practice) fills in automatically.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variance_tolerance_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00;
