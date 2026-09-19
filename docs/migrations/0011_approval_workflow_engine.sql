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
