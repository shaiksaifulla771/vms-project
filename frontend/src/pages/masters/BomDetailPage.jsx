import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDateTime, fmtQty } from '../../lib/format';
import { ErrorBox, Loading, PageHeader, Status } from '../../components/ui';

export default function BomDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite, notify } = useApp();
  const { data: bom, loading, error, setData } = useData(() => api.get(`/boms/${id}`), [id]);
  const [err, setErr] = useState(null);
  if (loading && !bom) return <Loading />;
  if (error) return <div className="p-5"><ErrorBox message={error} /></div>;

  const act = async (action, msg) => {
    setErr(null);
    try {
      const r = await api.post(`/boms/${id}/${action}`);
      notify(msg);
      if (r.id !== bom.id) navigate(`/masters/boms/${r.id}/edit`); else setData(r);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <PageHeader title={`${bom.bom_no} · v${bom.version}`} subtitle={`${bom.product_code} - ${bom.product_name} · ${bom.location_code} / ${bom.warehouse_code}`}
        actions={<>
          <Link className="btn-secondary" to="/masters/boms">Back</Link>
          {canWrite && bom.status === 'DRAFT' && <Link className="btn-secondary" to={`/masters/boms/${bom.id}/edit`}>Edit</Link>}
          {canWrite && bom.status === 'DRAFT' && <button type="button" className="btn-primary" onClick={() => act('activate', 'BOM activated')}>Activate</button>}
          {canWrite && bom.status === 'ACTIVE' && <button type="button" className="btn-secondary" onClick={() => act('obsolete', 'BOM marked obsolete')}>Mark Obsolete</button>}
          {canWrite && <button type="button" className="btn-secondary" onClick={() => act('revise', 'New draft version created')}>New Version</button>}
        </>} />
      <div className="p-5 space-y-4">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        <section className="card grid grid-cols-6 gap-x-6 gap-y-2 p-3 text-[13px]">
          {[
            ['Status', <Status key="s" value={bom.status} />], ['Batch Size', `${fmtQty(bom.batch_size)} ${bom.batch_uom}`],
            ['Expected Output', `${fmtQty(bom.expected_output_qty)} ${bom.output_uom}`], ['Location', bom.location_name],
            ['Warehouse', bom.warehouse_name], ['Updated', fmtDateTime(bom.updated_at)],
          ].map(([k, v]) => <div key={k}><div className="text-xs text-ink-muted">{k}</div><div>{v}</div></div>)}
          {bom.notes && <div className="col-span-6 text-ink-muted">{bom.notes}</div>}
        </section>
        <section className="card">
          <table className="w-full">
            <thead><tr>
              <th className="th w-12">#</th><th className="th">Material</th><th className="th">MPN</th><th className="th">Vendor</th>
              <th className="th text-right">Qty per Batch</th><th className="th">UOM</th><th className="th text-right">Scrap Allowance %</th>
            </tr></thead>
            <tbody>
              {bom.lines.map((l) => (
                <tr key={l.id}>
                  <td className="td">{l.line_no}</td>
                  <td className="td">{l.material_code} - {l.material_name}</td>
                  <td className="td">{l.mpn_code || <span className="text-ink-faint">any</span>}</td>
                  <td className="td">{l.vendor_name || '-'}</td>
                  <td className="td num">{fmtQty(l.qty_per_batch, 4)}</td>
                  <td className="td">{l.uom}</td>
                  <td className="td num">{fmtQty(l.scrap_allowance_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
