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
