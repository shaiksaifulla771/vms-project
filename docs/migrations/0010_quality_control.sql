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
