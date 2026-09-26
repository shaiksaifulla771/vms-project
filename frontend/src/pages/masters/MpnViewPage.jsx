import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, TXN_LABEL, fmtDate, fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, PageHeader, Status } from '../../components/ui';
import { DetailGrid, Section } from '../../components/masterKit';
import { PrintHeader } from '../../components/print';

const money = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

function Grid({ head, rows, empty, render }) {
  return (
    <table className="w-full border-collapse">
      <thead><tr>{head.map(([h, right]) => <th key={h} className={`th ${right ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td className="td text-ink-muted" colSpan={head.length}>{empty}</td></tr>}
        {rows.map(render)}
      </tbody>
    </table>
  );
}

/** Full-page MPN: details and HSN, vendors with price / MOQ / lead time, price history, stock lots, transactions. */
export default function MpnViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useApp();
  const { data: p, loading, error } = useData(() => api.get(`/mpns/${id}`, { scoped: false }), [id]);
  if (loading && !p) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;
  const total = p.stock.reduce((a, s) => a + Number(s.quantity), 0);
  return (
    <div>
      <PrintHeader title={`MPN ${p.mpn_code} - ${p.material_name}`} />
      <PageHeader title={`${p.mpn_code} - ${p.material_name}`} subtitle={`MPN of ${p.material_code} · ${CLASS_LABEL[p.classification] || ''}${p.hsn_code ? ` · HSN ${p.hsn_code}` : ''}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print</button>
          {canWrite && <button type="button" className="btn-primary" onClick={() => navigate(`/masters/mpns/${p.id}/edit`)}><Pencil size={14} /> Edit</button>}
        </>} />
      <div className="p-5 space-y-4">
        <Section title="Details">
          <DetailGrid cols={4} items={[
            ['MPN Code', p.mpn_code], ['Material', <Link key="m" className="text-accent" to={`/masters/materials/${p.material_id}`}>{p.material_code} - {p.material_name}</Link>, 'col-span-2'],
            ['Status', <Status key="s" value={p.status} />], ['HSN Code', p.hsn_code], ['Manufacturer', p.manufacturer],
            ['Stock on hand', `${fmtQty(total)} ${p.material_uom}`], ['Created', fmtDateTime(p.created_at)],
            ['Description', p.description, 'col-span-4'],
          ]} />
        </Section>
        <Section title={`Vendors (${p.vendors.length})`}>
          <Grid head={[['Vendor'], ['UOM'], ['MOQ', 1], ['Price (₹)', 1], ['Lead (days)', 1], ['Price updated']]} empty="No vendors" rows={p.vendors}
            render={(v) => (
              <tr key={v.id}><td className="td"><Link className="text-accent" to={`/masters/vendors/${v.vendor_id}`}>{v.vendor_code} - {v.vendor_name}</Link>{v.is_preferred ? ' (preferred)' : ''}</td>
                <td className="td">{v.uom}</td><td className="td num">{fmtQty(v.moq)}</td><td className="td num">{money(v.price)}</td>
                <td className="td num">{v.lead_time_days ?? '-'}</td><td className="td">{fmtDateTime(v.price_updated_at)}</td></tr>
            )} />
        </Section>
        <div className="grid grid-cols-2 gap-4">
          <Section title={`Stock lots (${p.stock.length})`}>
            <Grid head={[['Loc / WH'], ['Lot'], ['Qty', 1], ['Expiry']]} empty="No stock on this MPN" rows={p.stock}
              render={(s) => (
                <tr key={s.id}><td className="td">{s.location_code} / {s.warehouse_code}</td><td className="td">{s.lot_no}</td>
                  <td className="td num">{fmtQty(s.quantity)} {s.uom}</td>
                  <td className={`td ${s.is_expired ? 'text-danger' : ''}`}>{fmtDate(s.expiry_date)}</td></tr>
              )} />
          </Section>
          <Section title="Price history">
            <Grid head={[['When'], ['Vendor'], ['Old', 1], ['New', 1], ['By']]} empty="No changes yet" rows={p.price_history}
              render={(h) => (
                <tr key={h.id}><td className="td">{fmtDateTime(h.changed_at)}</td><td className="td">{h.vendor_name}</td>
                  <td className="td num">{money(h.old_price)}</td><td className="td num">{money(h.new_price)}</td><td className="td">{h.changed_by_name || '-'}</td></tr>
              )} />
          </Section>
        </div>
        <Section title="Last 20 transactions">
          <Grid head={[['When'], ['Type'], ['Lot'], ['Loc / WH'], ['Change', 1], ['Balance', 1], ['Reference']]} empty="No transactions" rows={p.transactions}
            render={(t) => (
              <tr key={t.txn_no}><td className="td">{fmtDateTime(t.txn_at)}</td><td className="td">{TXN_LABEL[t.txn_type] || t.txn_type}</td>
                <td className="td">{t.lot_no}</td><td className="td">{t.location_code} / {t.warehouse_code}</td>
                <td className={`td num ${Number(t.qty_change) < 0 ? 'text-danger' : ''}`}>{Number(t.qty_change) > 0 ? '+' : ''}{fmtQty(t.qty_change)}</td>
                <td className="td num">{fmtQty(t.new_balance)}</td><td className="td">{t.reference_id || '-'}</td></tr>
            )} />
        </Section>
      </div>
    </div>
  );
}
