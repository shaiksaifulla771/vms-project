import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/app-context';
import { ErrorBox, Field, Modal, PageHeader, Status } from '../components/ui';
import { useCategories } from '../components/pickers';
import { DeleteDialog } from '../components/masterKit';

function CategoryForm({ cat, parent, onClose, onDone }) {
  const [name, setName] = useState(cat?.name || '');
  const [status, setStatus] = useState(cat?.status || 'ACTIVE');
  const [err, setErr] = useState(null);
  const save = async () => {
    try {
      if (cat) await api.put(`/categories/${cat.id}`, { name, status });
      else await api.post('/categories', { name, parent_id: parent?.id });
      onDone();
    } catch (e) { setErr(e.message); }
  };
  const kind = (cat ? cat.parent_id : parent) ? 'Sub-category' : 'Category';
  return (
    <Modal title={cat ? `Edit ${kind}` : `New ${kind}${parent ? ` under ${parent.name}` : ''}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Name" required className="col-span-2"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></Field>
        {cat && (
          <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
        )}
      </div>
    </Modal>
  );
}

export default function CategoriesPage() {
  const { canWrite, notify } = useApp();
  const [k, setK] = useState(0);
  const cats = useCategories(k);
  const [modal, setModal] = useState(null);
  const done = (msg) => { setModal(null); if (msg) notify(msg); setK((x) => x + 1); };

  const Row = ({ c, sub }) => (
    <tr className="hover:bg-panel">
      <td className={`td ${sub ? 'pl-10 text-ink-soft' : 'font-medium'}`}>{sub ? '└ ' : ''}{c.name}</td>
      <td className="td text-ink-muted">{sub ? 'Sub-category' : 'Category'}</td>
      <td className="td num">{c.material_count}</td>
      <td className="td"><Status value={c.status} /></td>
      <td className="td text-right">
        {canWrite && (
          <span className="inline-flex gap-1">
            {!sub && <button type="button" className="btn-link mr-2" onClick={() => setModal({ parent: c })}><Plus size={13} /> Sub-category</button>}
            <button type="button" title="Edit" className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted hover:text-accent hover:bg-panel" onClick={() => setModal({ cat: c })}><Pencil size={14} /></button>
            <button type="button" title="Delete" className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted hover:text-danger hover:bg-panel" onClick={() => setModal({ del: c })}><Trash2 size={14} /></button>
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <div>
      <PageHeader title="Material Categories" subtitle="Categories and sub-categories used on the Material form"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({})}><Plus size={14} /> New Category</button>} />
      <div className="p-5">
        <div className="card overflow-hidden max-w-4xl">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Name</th><th className="th">Level</th><th className="th text-right">Materials</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {cats.length === 0 && <tr><td className="td text-ink-muted" colSpan={5}>No categories yet</td></tr>}
              {cats.map((c) => [<Row key={c.id} c={c} />, ...c.children.map((s) => <Row key={s.id} c={s} sub />)])}
            </tbody>
          </table>
        </div>
      </div>
      {(modal?.cat || modal?.parent || (modal && !modal.del && !modal.cat && !modal.parent)) && !modal?.del && (
        <CategoryForm cat={modal.cat} parent={modal.parent} onClose={() => setModal(null)} onDone={() => done('Category saved')} />
      )}
      {modal?.del && <DeleteDialog label={modal.del.name} path={`/categories/${modal.del.id}`} onClose={() => setModal(null)} onDone={() => done()} />}
    </div>
  );
}
