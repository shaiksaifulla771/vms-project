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
