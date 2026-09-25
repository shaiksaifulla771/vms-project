import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, TXN_LABEL, fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, PageHeader, Status } from '../../components/ui';
import { DeleteDialog, DetailGrid, Section } from '../../components/masterKit';
import { FssaiExpiry } from './VendorsPage';
import { PrintHeader } from '../../components/print';

export default function VendorViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useApp();
  const [del, setDel] = useState(false);
  const { data: v, loading, error } = useData(() => api.get(`/vendors/${id}`, { scoped: false }), [id]);

  if (loading || !v) return <><PageHeader title="Vendor" /><div className="p-5"><ErrorBox message={error} />{!error && <Loading />}</div></>;

  return (
    <div>
      <PrintHeader title={`Vendor ${v.code} - ${v.name}`} />
      <PageHeader title={`${v.code} - ${v.name}`} subtitle={<Link to="/masters/vendors" className="inline-flex items-center gap-1 hover:text-accent"><ChevronLeft size={12} /> All vendors</Link>}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print</button>
          {canWrite && <button type="button" className="btn-danger" onClick={() => setDel(true)}>Delete</button>}
          {canWrite && <button type="button" className="btn-primary" onClick={() => navigate(`/masters/vendors/${id}/edit`)}>Edit</button>}
        </>} />
      <div className="p-5 space-y-4 max-w-6xl">
        <Section title="Vendor details">
          <DetailGrid cols={4} items={[
            ['Vendor Code', v.code], ['Vendor Name', v.name, 'col-span-2'], ['Status', <Status key="s" value={v.status} />],
            ['Phone', v.phone], ['Email', v.contact_email], ['GSTIN', v.gstin], [' ', ''],
            ['FSSAI Licence No.', v.fssai_no], ['FSSAI Expiry', <FssaiExpiry key="f" date={v.fssai_expiry} />],
            ['Created', fmtDateTime(v.created_at)], ['Last updated', fmtDateTime(v.updated_at)],
          ]} />
        </Section>

        <Section title={`Materials supplied, from MPNs (${v.mpns.length})`}
          actions={canWrite && <button type="button" className="btn-link" onClick={() => navigate(`/masters/mpns?new=1&vendor_id=${id}`)}><Plus size={13} /> Add MPN for this vendor</button>}>
          {v.mpns.length === 0 ? <p className="text-ink-muted text-[13px]">No MPNs yet. Add one to record what this vendor supplies and at what price.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">MPN</th><th className="th">Material</th><th className="th">UOM</th><th className="th text-right">MOQ</th><th className="th text-right">Price (₹)</th><th className="th text-right">Lead time (d)</th><th className="th" /></tr></thead>
              <tbody>{v.mpns.map((p) => (
                <tr key={p.id}><td className="td">{p.mpn_code}</td><td className="td">{p.material_code} - {p.material_name}</td><td className="td">{p.uom}</td>
                  <td className="td num">{fmtQty(p.moq)}</td><td className="td num">{p.price == null ? '' : Number(p.price).toFixed(2)}</td>
                  <td className="td num">{p.lead_time_days}</td><td className="td text-ink-muted">{p.is_preferred ? 'Preferred' : ''}</td></tr>
              ))}</tbody>
            </table>
          )}
          {v.unpriced_links?.length > 0 && (
            <div className="mt-3">
              <div className="text-xs2 uppercase tracking-wide text-ink-muted mb-1">Linked without MPN (add price)</div>
              <table className="w-full border-collapse">
                <tbody>{v.unpriced_links.map((m) => (
                  <tr key={m.id}><td className="td w-32">{m.code}</td><td className="td">{m.name}</td><td className="td text-ink-muted">{CLASS_LABEL[m.classification]} · {m.uom}</td>
                    <td className="td text-right">{canWrite && <button type="button" className="btn-link" onClick={() => navigate(`/masters/mpns?new=1&vendor_id=${id}&material_id=${m.id}`)}>Create MPN</button>}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title={`Addresses (${v.addresses.length})`}>
          {v.addresses.length === 0 ? <p className="text-ink-muted text-[13px]">No addresses.</p> : (
            <div className="grid grid-cols-3 gap-3">
              {v.addresses.map((a) => (
                <div key={a.id} className="border border-line rounded p-3 text-[13px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{a.address_name}</span>
                    <span className="text-xs2 text-ink-muted uppercase tracking-wide">{a.is_default ? 'Default address' : ''}</span>
                  </div>
                  <div className="text-ink-soft">{[a.line1, a.line2].filter(Boolean).join(', ')}</div>
                  <div className="text-ink-soft">{[a.city, a.state, a.pincode].filter(Boolean).join(', ')}</div>
                  <div className="text-ink-soft">{a.country}</div>
                  {a.gstin && <div className="text-ink-muted text-xs mt-1">GSTIN {a.gstin}</div>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Contact directory (${v.contacts.length})`}>
          {v.contacts.length === 0 ? <p className="text-ink-muted text-[13px]">No contacts.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Name</th><th className="th">Designation</th><th className="th">Phone</th><th className="th">Email</th></tr></thead>
              <tbody>{v.contacts.map((c) => <tr key={c.id}><td className="td">{c.name}</td><td className="td">{c.designation}</td><td className="td">{c.phone}</td><td className="td">{c.email}</td></tr>)}</tbody>
            </table>
          )}
        </Section>

        <Section title="Bank details">
          {v.bank_accounts.length === 0 ? <p className="text-ink-muted text-[13px]">No bank account.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Account Holder</th><th className="th">Account Number</th><th className="th">IFSC</th><th className="th">Bank</th><th className="th">Branch</th><th className="th" /></tr></thead>
              <tbody>{v.bank_accounts.map((b) => (
                <tr key={b.id}><td className="td">{b.account_holder}</td><td className="td tabular-nums">{b.account_number}</td><td className="td">{b.ifsc}</td>
                  <td className="td">{b.bank_name}</td><td className="td">{b.branch}</td><td className="td text-ink-muted">{b.is_primary ? 'Primary' : ''}</td></tr>
              ))}</tbody>
            </table>
          )}
          <p className="text-xs2 text-ink-faint mt-2">Account numbers are masked here. Open Edit to see them in full.</p>
        </Section>

        <Section title={`Recent receipts from this vendor (${v.recent_receipts?.length || 0})`}>
          {!v.recent_receipts?.length ? <p className="text-ink-muted text-[13px]">No stock received from this vendor yet.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">When</th><th className="th">Type</th><th className="th">Material</th><th className="th">Lot</th>
                <th className="th">Location</th><th className="th text-right">Qty</th><th className="th">Reference</th></tr></thead>
              <tbody>{v.recent_receipts.map((r) => (
                <tr key={r.txn_no}><td className="td">{fmtDateTime(r.txn_at)}</td><td className="td">{TXN_LABEL[r.txn_type] || r.txn_type}</td>
                  <td className="td">{r.material_code} - {r.material_name}</td><td className="td">{r.lot_no}</td><td className="td">{r.location_code}</td>
                  <td className="td num">{fmtQty(r.qty_change)} {r.uom}</td><td className="td">{r.reference_id || '-'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Section>

      </div>
      {del && <DeleteDialog label={`${v.code} ${v.name}`} path={`/vendors/${id}`} onClose={() => setDel(false)} onDone={() => navigate('/masters/vendors')} />}
    </div>
  );
}
