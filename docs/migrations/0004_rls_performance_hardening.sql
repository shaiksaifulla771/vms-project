-- ============================================================================
-- RLS performance hardening (Supabase performance advisor):
--
-- 1. auth_rls_initplan: a bare auth.uid() / public.get_auth_role() call in
--    a policy is re-evaluated once PER ROW scanned. Wrapping it as
--    (select auth.uid()) lets Postgres treat it as an InitPlan -- evaluated
--    ONCE per query and reused. Same predicate, no behavior change, just
--    no longer O(rows) function calls per query.
-- 2. multiple_permissive_policies: a `_read` FOR SELECT policy plus an
--    `_admin_write FOR ALL` policy are BOTH permissive policies covering
--    SELECT on the same table/role, so Postgres evaluates both on every
--    read. Splitting FOR ALL into FOR INSERT / FOR UPDATE / FOR DELETE
--    (dropping its implicit SELECT) leaves exactly one permissive SELECT
--    policy per table.
-- ============================================================================

-- user_profiles ---------------------------------------------------------
DROP POLICY IF EXISTS user_profiles_self_or_admin_read ON public.user_profiles;
CREATE POLICY user_profiles_self_or_admin_read ON public.user_profiles
    FOR SELECT TO authenticated
    USING (id = (select auth.uid()) OR public.get_auth_role() = 'admin');

DROP POLICY IF EXISTS user_profiles_admin_update ON public.user_profiles;
CREATE POLICY user_profiles_admin_update ON public.user_profiles
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');

-- vendors -----------------------------------------------------------------
DROP POLICY IF EXISTS vendors_admin_write ON public.vendors;
CREATE POLICY vendors_admin_insert ON public.vendors
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY vendors_admin_update ON public.vendors
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY vendors_admin_delete ON public.vendors
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- materials -----------------------------------------------------------------
DROP POLICY IF EXISTS materials_admin_write ON public.materials;
CREATE POLICY materials_admin_insert ON public.materials
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY materials_admin_update ON public.materials
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY materials_admin_delete ON public.materials
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- products -----------------------------------------------------------------
DROP POLICY IF EXISTS products_admin_write ON public.products;
CREATE POLICY products_admin_insert ON public.products
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY products_admin_update ON public.products
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY products_admin_delete ON public.products
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- boms -----------------------------------------------------------------
DROP POLICY IF EXISTS boms_admin_write ON public.boms;
CREATE POLICY boms_admin_insert ON public.boms
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY boms_admin_update ON public.boms
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY boms_admin_delete ON public.boms
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- bom_items -----------------------------------------------------------------
DROP POLICY IF EXISTS bom_items_admin_write ON public.bom_items;
CREATE POLICY bom_items_admin_insert ON public.bom_items
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY bom_items_admin_update ON public.bom_items
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY bom_items_admin_delete ON public.bom_items
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- material_vendors (MPN) -----------------------------------------------------------------
DROP POLICY IF EXISTS mpn_admin_write ON public.material_vendors;
CREATE POLICY mpn_admin_insert ON public.material_vendors
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY mpn_admin_update ON public.material_vendors
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY mpn_admin_delete ON public.material_vendors
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- vendor_prices -----------------------------------------------------------------
DROP POLICY IF EXISTS vendor_prices_admin_write ON public.vendor_prices;
CREATE POLICY vendor_prices_admin_insert ON public.vendor_prices
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY vendor_prices_admin_update ON public.vendor_prices
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY vendor_prices_admin_delete ON public.vendor_prices
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- purchase_requests (already split by action; fix initplan only) --------
DROP POLICY IF EXISTS pr_editor_insert ON public.purchase_requests;
CREATE POLICY pr_editor_insert ON public.purchase_requests
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) IN ('admin', 'editor') AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS pr_editor_update_own_draft ON public.purchase_requests;
CREATE POLICY pr_editor_update_own_draft ON public.purchase_requests
    FOR UPDATE TO authenticated
    USING (
        (select public.get_auth_role()) IN ('admin', 'editor')
        AND (
            (select public.get_auth_role()) = 'admin'
            OR (created_by = (select auth.uid()) AND status IN ('DRAFT', 'SUBMITTED'))
        )
    )
    WITH CHECK (
        (select public.get_auth_role()) IN ('admin', 'editor')
        AND ((select public.get_auth_role()) = 'admin' OR created_by = (select auth.uid()))
    );

DROP POLICY IF EXISTS pr_admin_delete ON public.purchase_requests;
CREATE POLICY pr_admin_delete ON public.purchase_requests
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- purchase_request_items (split FOR ALL, fix initplan) ------------------
DROP POLICY IF EXISTS pr_items_write ON public.purchase_request_items;
CREATE POLICY pr_items_insert ON public.purchase_request_items
    FOR INSERT TO authenticated
    WITH CHECK (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    );
CREATE POLICY pr_items_update ON public.purchase_request_items
    FOR UPDATE TO authenticated
    USING (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    )
    WITH CHECK (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    );
CREATE POLICY pr_items_delete ON public.purchase_request_items
    FOR DELETE TO authenticated
    USING (
        (select public.get_auth_role()) = 'admin' OR EXISTS (
            SELECT 1 FROM public.purchase_requests pr
            WHERE pr.id = purchase_request_items.pr_id
              AND pr.created_by = (select auth.uid())
              AND pr.status = 'DRAFT'
        )
    );

-- purchase_orders -----------------------------------------------------------------
DROP POLICY IF EXISTS po_admin_write ON public.purchase_orders;
CREATE POLICY po_admin_insert ON public.purchase_orders
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin' AND created_by = (select auth.uid()));
CREATE POLICY po_admin_update ON public.purchase_orders
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY po_admin_delete ON public.purchase_orders
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- purchase_order_items -----------------------------------------------------------------
DROP POLICY IF EXISTS po_items_admin_write ON public.purchase_order_items;
CREATE POLICY po_items_admin_insert ON public.purchase_order_items
    FOR INSERT TO authenticated
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY po_items_admin_update ON public.purchase_order_items
    FOR UPDATE TO authenticated
    USING ((select public.get_auth_role()) = 'admin')
    WITH CHECK ((select public.get_auth_role()) = 'admin');
CREATE POLICY po_items_admin_delete ON public.purchase_order_items
    FOR DELETE TO authenticated
    USING ((select public.get_auth_role()) = 'admin');

-- purchase_order_receipts (fix initplan only) ----------------------------
DROP POLICY IF EXISTS po_receipts_editor_insert ON public.purchase_order_receipts;
CREATE POLICY po_receipts_editor_insert ON public.purchase_order_receipts
    FOR INSERT TO authenticated
    WITH CHECK (
        (select public.get_auth_role()) IN ('admin', 'editor')
        AND created_by = (select auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = purchase_order_receipts.po_id
              AND po.status IN ('ISSUED', 'PARTIALLY_RECEIVED')
        )
    );
