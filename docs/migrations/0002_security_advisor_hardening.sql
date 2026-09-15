-- ============================================================================
-- Security advisor hardening (run immediately after 0001_initial_schema):
-- 1. anon must not be able to execute any of our SECURITY DEFINER
--    functions via PostgREST RPC -- our backend connects directly via
--    asyncpg as `authenticated`, it never goes through PostgREST, so anon
--    has no legitimate reason to call any of these.
-- 2. trg_auto_provision_user_profile was missing SET search_path, making
--    its search_path mutable (an attacker could shadow public.user_profiles
--    with a same-named object earlier in an attacker-controlled path).
-- 3. btree_gist must not live in the public schema.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.get_auth_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_pr_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_po_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_grn_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_audit(VARCHAR, UUID, audit_action, JSONB, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_auto_provision_user_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_auto_provision_user_profile() FROM authenticated;

CREATE OR REPLACE FUNCTION public.trg_auto_provision_user_profile()
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

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
