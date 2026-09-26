-- ===========================================================================
-- 014  Vendor contact notes (v12)
--   * vendor_contacts.notes: free text per contact (e.g. "calls only before 11am", "handles invoices")
-- Additive only.
-- ===========================================================================

alter table public.vendor_contacts add column if not exists notes text;
alter table public.vendor_contacts drop constraint if exists vendor_contacts_notes_len;
alter table public.vendor_contacts add constraint vendor_contacts_notes_len check (notes is null or length(notes) <= 1000);
