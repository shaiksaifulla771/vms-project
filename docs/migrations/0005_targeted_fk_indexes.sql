-- ============================================================================
-- Covering indexes for FK columns this app actually filters/joins on.
-- Deliberately NOT indexing every *_created_by / *_updated_by / *_issued_by
-- / *_closed_by / *_decided_by / *_submitted_by audit-trail column the
-- performance advisor flags (INFO level) -- those are write-path
-- provenance, never a WHERE/JOIN key in this codebase's query patterns,
-- and an unused index still costs every future write on that table.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_bom_items_material ON public.bom_items(material_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material ON public.purchase_order_items(material_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material_vendor ON public.purchase_order_items(material_vendor_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_material ON public.purchase_request_items(material_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_suggested_vendor ON public.purchase_request_items(suggested_vendor_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id);
