-- ============================================================================
-- public is PostgREST's exposed API schema: any function living there with
-- EXECUTE granted to authenticated is reachable over HTTP as
-- /rest/v1/rpc/<name> by ANY signed-in user, with arguments of their
-- choosing. record_audit and the next_*_number generators are internal
-- plumbing the backend calls over its own direct asyncpg connection --
-- never meant to be public RPC endpoints. GRANT/REVOKE can't distinguish
-- "our backend's SQL call" from "a user's PostgREST RPC call" because both
-- run as the same `authenticated` Postgres role, so the only real fix is
-- moving these out of the exposed schema entirely.
--
-- get_auth_role() stays in public: it is genuinely meant to be callable by
-- every authenticated user (it only ever returns the caller's own role,
-- the same value docs/RBAC.md documents every RLS policy consulting), so
-- its PostgREST exposure is intentional, not a gap.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
GRANT USAGE ON SCHEMA internal TO authenticated;

ALTER FUNCTION public.record_audit(VARCHAR, UUID, audit_action, JSONB, JSONB) SET SCHEMA internal;
ALTER FUNCTION public.next_pr_number() SET SCHEMA internal;
ALTER FUNCTION public.next_po_number() SET SCHEMA internal;
ALTER FUNCTION public.next_grn_number() SET SCHEMA internal;
ALTER FUNCTION public.trg_auto_provision_user_profile() SET SCHEMA internal;

-- REVOKE EXECUTE ON FUNCTION ... FROM anon in 0002 is preserved across
-- SET SCHEMA (grants attach to the function's OID, not its qualified
-- name), so no need to re-revoke here -- this just closes the "reachable
-- via PostgREST at all" gap those revokes couldn't close on their own.
