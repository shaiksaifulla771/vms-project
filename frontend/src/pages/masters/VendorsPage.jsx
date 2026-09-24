import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useApp, useData } from '../../lib/app-context';
import { fmtDate } from '../../lib/format';
import { DataTable, ErrorBox, PageHeader, Status } from '../../components/ui';
import { BulkDialog, DeleteDialog, FunctionsMenu, actionsColumn } from '../../components/masterKit';

/** FSSAI expiry: shows a warning when expired or due within 30 days. */
export function FssaiExpiry({ date }) {
  if (!date) return <span className="text-ink-faint">-</span>;
  const d = new Date(String(date).slice(0, 10));
  const days = Math.floor((d - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
  return (
    <span className={days < 0 ? 'text-danger' : ''}>
      {fmtDate(date)}
      {days < 0 && ' (expired)'}
      {days >= 0 && days <= 30 && <span className="text-ink-muted"> ({days} d left)</span>}
    </span>
  );
}

export default function VendorsPage() {
  const { canWrite } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useData(() => api.get(`/vendors${qs({ status })}`, { scoped: false }), [status]);
  const close = () => setModal(null);

  const columns = [
    { key: 'code', label: 'Vendor Code' },
    { key: 'name', label: 'Vendor Name', className: 'whitespace-normal min-w-[180px]' },
    { key: 'default_address', label: 'Default Address' },
    { key: 'primary_contact', label: 'Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'fssai_expiry', label: 'FSSAI Expiry', render: (r) => <FssaiExpiry date={r.fssai_expiry} />, value: (r) => r.fssai_expiry },
    { key: 'material_count', label: 'Materials', align: 'right' },
    { key: 'mpn_count', label: 'MPNs', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} />, value: (r) => r.status },
    { key: 'created_at', label: 'Added', render: (r) => fmtDate(r.created_at), value: (r) => r.created_at || '' },
    actionsColumn({
      canWrite,
      onView: (r) => navigate(`/masters/vendors/${r.id}`),
      onEdit: (r) => navigate(`/masters/vendors/${r.id}/edit`),
      onDelete: (r) => setModal({ type: 'delete', row: r }),
    }),
  ];

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Suppliers, their addresses, contacts, bank details and supplied materials"
        actions={<>
          <FunctionsMenu entity="vendors" onManual={() => navigate('/masters/vendors/new')} onBulk={(mode) => setModal({ type: 'bulk', mode })} />
          {canWrite && <button type="button" className="btn-primary" onClick={() => navigate('/masters/vendors/new')}><Plus size={14} /> New Vendor</button>}
        </>} />
      <div className="p-5 space-y-3">
        <ErrorBox message={error} />
        <DataTable columns={columns} rows={data || []} loading={loading} newField="created_at" onRowClick={(r) => navigate(`/masters/vendors/${r.id}`)}
          toolbar={(
            <select className="input w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            </select>
          )} />
      </div>
      {modal?.type === 'delete' && <DeleteDialog label={`${modal.row.code} ${modal.row.name}`} path={`/vendors/${modal.row.id}`} onClose={close} onDone={() => { close(); reload(); }} />}
      {modal?.type === 'bulk' && <BulkDialog entity="vendors" mode={modal.mode} onClose={close} onDone={() => { close(); reload(); }} />}
    </div>
  );
}
