import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { CLASS_LABEL, TXN_LABEL, fmtDate, fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, PageHeader, Status } from '../../components/ui';
import { DetailGrid, Section } from '../../components/masterKit';
import { PrintHeader } from '../../components/print';
import { MaterialForm } from './MaterialsPage';

const money = (v) => (v === null || v === undefined ? '-' : `₹ ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`);

/** Small read-only table used by every section of the page. */
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

/**
 * Full-page view of a material or product: details, MPNs and prices, BOMs, where it is used,
 * stock by lot, open plans, recent batches and transactions - everything on one screen.
 */
export default function MaterialViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite, notify, locations, locationId } = useApp();
  const [k, setK] = useState(0);
  const { data: m, loading, error } = useData(() => api.get(`/materials/${id}`, { scoped: false }), [id, k]);
  const { data: o } = useData(() => api.get(`/materials/${id}/overview`), [id, k, locationId]);
  const [edit, setEdit] = useState(false);
  if (loading && !m) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;
  const product = ['FINISHED_GOOD', 'SEMI_FINISHED'].includes(m.classification);
  const fg = m.classification === 'FINISHED_GOOD';
  const scope = locationId ? (locations.find((l) => l.id === locationId)?.code || '') : 'All locations';

  return (
    <div>
      <PrintHeader title={`${m.code} - ${m.name}`} filters={[['Stock and transactions', scope]]} />
      <PageHeader title={`${m.code} - ${m.name}`} subtitle={`${CLASS_LABEL[m.classification]} · ${m.uom}${m.category_name ? ` · ${m.category_name}` : ''}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print</button>
          {canWrite && product && <button type="button" className="btn-secondary" onClick={() => navigate(`/masters/boms/new?product_id=${m.id}`)}><Plus size={14} /> Create BOM</button>}
          {canWrite && !fg && <button type="button" className="btn-secondary" onClick={() => navigate(`/masters/mpns?new=1&material_id=${m.id}`)}><Plus size={14} /> Add MPN</button>}
          {canWrite && <button type="button" className="btn-primary" onClick={() => setEdit(true)}><Pencil size={14} /> Edit</button>}
        </>} />
      <div className="p-5 space-y-4">
        <Section title="Details">
          <DetailGrid cols={4} items={[
            ['Code', m.code], ['Name', m.name, 'col-span-2'], ['Status', <Status key="s" value={m.status} />],
            ['Classification', CLASS_LABEL[m.classification]], ['Category', m.category_name], ['Sub-category', m.sub_category_name], ['Base UOM', m.uom],
            ['Shelf Life (days)', m.shelf_life_days], ['Reorder Level', m.reorder_level == null ? '' : `${fmtQty(m.reorder_level)} ${m.uom}`],
            ['Stock (' + scope + ')', o ? `${fmtQty(o.stock_total)} ${m.uom}` : '...'], ['Last updated', fmtDateTime(m.updated_at)],
            ['Description', m.description, 'col-span-4'],
          ]} />
        </Section>

        {fg ? (
          <p className="text-[13px] text-ink-muted">Finished good: made in-house, so it has no MPN or vendor. Stock comes from production batches, Opening Stock or Adjustment.</p>
        ) : (
          <Section title={`MPNs and vendor prices (${m.mpns.length})`}>
            <Grid head={[['MPN'], ['HSN'], ['Vendor'], ['UOM'], ['MOQ', 1], ['Price', 1], ['Status']]} empty="No MPNs yet"
              rows={m.mpns.flatMap((p) => (p.vendors.length ? p.vendors : [{}]).map((v, i) => ({ p, v, i })))}
              render={({ p, v, i }) => (
                <tr key={`${p.id}-${i}`}>
                  <td className="td">{i === 0 && <Link className="text-accent" to={`/masters/mpns/${p.id}`}>{p.mpn_code}</Link>}</td>
                  <td className="td">{i === 0 ? (p.hsn_code || '-') : ''}</td>
                  <td className="td">{v.vendor_name ? <Link className="text-accent" to={`/masters/vendors/${v.vendor_id}`}>{v.vendor_code} - {v.vendor_name}</Link> : '-'}{v.is_preferred ? ' (preferred)' : ''}</td>
                  <td className="td">{v.uom}</td><td className="td num">{fmtQty(v.moq)}</td><td className="td num">{money(v.price)}</td>
                  <td className="td">{i === 0 && <Status value={p.status} />}</td>
                </tr>
              )} />
          </Section>
        )}

        <div className={product ? 'grid grid-cols-2 gap-4' : ''}>
          {product && (
            <Section title={`BOMs of this product (${o?.boms.length ?? 0})`}>
              <Grid head={[['BOM'], ['Name'], ['Location'], ['Output', 1], ['Status']]} empty="No BOM yet" rows={o?.boms || []}
                render={(b) => (
                  <tr key={b.id}><td className="td"><Link className="text-accent" to={`/masters/boms/${b.id}`}>{b.bom_no} v{b.version}</Link></td>
                    <td className="td">{b.name || '-'}{b.is_default ? ' (Default)' : ''}</td><td className="td">{b.location_code}</td>
                    <td className="td num">{fmtQty(b.expected_output_qty)} {b.output_uom}</td><td className="td"><Status value={b.status} /></td></tr>
                )} />
            </Section>
          )}
          <Section title={`Used in BOMs (${o?.used_in_boms.length ?? 0})`}>
            <Grid head={[['BOM'], ['Product'], ['Location'], ['Qty / batch', 1]]} empty="Not used in any active or draft BOM" rows={o?.used_in_boms || []}
              render={(b) => (
                <tr key={b.id}><td className="td"><Link className="text-accent" to={`/masters/boms/${b.id}`}>{b.bom_no} v{b.version}</Link>{b.name ? ` · ${b.name}` : ''}</td>
                  <td className="td">{b.product_code} - {b.product_name}</td><td className="td">{b.location_code}</td>
                  <td className="td num">{fmtQty(b.qty_per_batch, 4)} {b.uom}</td></tr>
              )} />
          </Section>
        </div>

        <Section title={`Stock by lot · ${scope} (${o?.stock.length ?? 0} lots, ${fmtQty(o?.stock_total || 0)} ${m.uom})`}>
          <Grid head={[['Location / WH'], ['Lot'], ['MPN'], ['Vendor'], ['Qty', 1], ['Mfg'], ['Expiry']]} empty="No stock" rows={o?.stock || []}
            render={(s) => (
              <tr key={s.id}><td className="td">{s.location_code} / {s.warehouse_code}</td><td className="td">{s.lot_no}</td>
                <td className="td">{s.mpn_code || '-'}</td><td className="td">{s.vendor_name || '-'}</td>
                <td className="td num">{fmtQty(s.quantity)} {s.uom}</td><td className="td">{fmtDate(s.mfg_date)}</td>
                <td className={`td ${s.is_expired ? 'text-danger' : ''}`}>{fmtDate(s.expiry_date)}{s.is_expired ? ' (expired)' : ''}</td></tr>
            )} />
        </Section>

        {product && (
          <div className="grid grid-cols-2 gap-4">
            <Section title={`Open plans (${o?.open_plans.length ?? 0})`}>
              <Grid head={[['Plan'], ['Remaining', 1], ['Required by'], ['Status']]} empty="No open plans" rows={o?.open_plans || []}
                render={(p) => (
                  <tr key={p.id}><td className="td"><Link className="text-accent" to={`/planning/plans/${p.id}`}>{p.plan_no}</Link></td>
                    <td className="td num">{fmtQty(p.remaining_qty)}</td><td className="td">{fmtDate(p.required_date)}</td><td className="td"><Status value={p.status} /></td></tr>
                )} />
            </Section>
            <Section title={`Recent batches (${o?.recent_batches.length ?? 0})`}>
              <Grid head={[['Batch'], ['Mfg'], ['Expiry'], ['Output', 1]]} empty="No batches yet" rows={o?.recent_batches || []}
                render={(b) => (
                  <tr key={b.id}><td className="td"><Link className="text-accent" to={`/manufacturing/batches/${b.id}`}>{b.batch_no}</Link></td>
                    <td className="td">{fmtDate(b.mfg_date)}</td><td className="td">{fmtDate(b.expiry_date)}</td>
                    <td className="td num">{fmtQty(b.actual_output_qty)} {b.output_uom}</td></tr>
                )} />
            </Section>
          </div>
        )}

        <Section title="Last 20 transactions">
          <Grid head={[['When'], ['Type'], ['Lot'], ['Loc / WH'], ['Change', 1], ['Balance', 1], ['Reference'], ['By']]} empty="No transactions" rows={o?.transactions || []}
            render={(t) => (
              <tr key={t.txn_no}><td className="td">{fmtDateTime(t.txn_at)}</td><td className="td">{TXN_LABEL[t.txn_type] || t.txn_type}</td>
                <td className="td">{t.lot_no}</td><td className="td">{t.location_code} / {t.warehouse_code}</td>
                <td className={`td num ${Number(t.qty_change) < 0 ? 'text-danger' : ''}`}>{Number(t.qty_change) > 0 ? '+' : ''}{fmtQty(t.qty_change)}</td>
                <td className="td num">{fmtQty(t.new_balance)}</td><td className="td">{t.reference_id || '-'}</td><td className="td">{t.user_name || '-'}</td></tr>
            )} />
        </Section>
      </div>
      {edit && <MaterialForm material={m} onClose={() => setEdit(false)}
        onDone={() => { setEdit(false); notify('Material saved'); setK((x) => x + 1); }} />}
    </div>
  );
}
