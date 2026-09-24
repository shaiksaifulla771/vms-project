import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/app-context';
import { CLASS_LABEL } from '../lib/format';
import { ErrorBox, Field, Modal, PageHeader, Status, Tabs } from '../components/ui';
import { useCategories } from '../components/pickers';
import { DeleteDialog } from '../components/masterKit';

const CLASSES = Object.entries(CLASS_LABEL);

function CategoryForm({ cat, parent, defaultClass, onClose, onDone }) {
  const isSub = Boolean(cat ? cat.parent_id : parent);
  const [name, setName] = useState(cat?.name || '');
  const [status, setStatus] = useState(cat?.status || 'ACTIVE');
  const [cls, setCls] = useState(cat ? (cat.classification || '') : (defaultClass || ''));
  const [err, setErr] = useState(null);
  const save = async () => {
    try {
      if (!isSub && !cat && !cls) throw new Error('Choose the classification this category is for');
      if (cat) await api.put(`/categories/${cat.id}`, { name, status, ...(isSub ? {} : { classification: cls }) });
      else await api.post('/categories', { name, parent_id: parent?.id, classification: isSub ? undefined : cls });
      onDone();
    } catch (e) { setErr(e.message); }
  };
  const kind = isSub ? 'Sub-category' : 'Category';
  return (
    <Modal title={cat ? `Edit ${kind}` : `New ${kind}${parent ? ` under ${parent.name}` : ''}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <ErrorBox message={err} />
      <div className="grid grid-cols-2 gap-3">
        {isSub ? (
          <Field label="Classification" hint="Sub-categories follow their category">
            <input className="input" disabled value={CLASS_LABEL[(cat ? cat.classification : parent.classification)] || 'Any classification'} />
          </Field>
        ) : (
          <Field label="Classification" required hint="Materials of this classification will see this category">
            <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">{cat ? 'Any classification (not assigned)' : 'Select classification'}</option>
              {CLASSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        )}
        <Field label="Name" required><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
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
  const [tab, setTab] = useState('');
  const [modal, setModal] = useState(null);
  const done = (msg) => { setModal(null); if (msg) notify(msg); setK((x) => x + 1); };

  const count = (c) => cats.filter((x) => (c === 'NONE' ? !x.classification : x.classification === c)).length;
  const tabs = [
    { value: '', label: `All (${cats.length})` },
    ...CLASSES.map(([v, l]) => ({ value: v, label: `${l} (${count(v)})` })),
    ...(count('NONE') ? [{ value: 'NONE', label: `Not assigned (${count('NONE')})` }] : []),
  ];
  const shown = cats.filter((c) => !tab || (tab === 'NONE' ? !c.classification : c.classification === tab));
  const order = Object.keys(CLASS_LABEL);
  shown.sort((a, b) => (order.indexOf(a.classification) + 1 || 99) - (order.indexOf(b.classification) + 1 || 99) || a.name.localeCompare(b.name));

  const Row = ({ c, sub }) => (
    <tr className="hover:bg-panel">
      <td className="td text-ink-muted">{sub ? '' : (CLASS_LABEL[c.classification] || <span className="text-ink-faint">Any (not assigned)</span>)}</td>
      <td className={`td ${sub ? 'pl-8 text-ink-soft' : 'font-medium'}`}>{sub ? '└ ' : ''}{c.name}</td>
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
      <PageHeader title="Material Categories" subtitle="Each category belongs to a classification; the Material form shows only the categories of the chosen classification"
        actions={canWrite && <button type="button" className="btn-primary" onClick={() => setModal({ isNew: true })}><Plus size={14} /> New Category</button>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="p-5">
        <div className="card overflow-hidden max-w-5xl">
          <table className="w-full border-collapse">
            <thead><tr><th className="th w-44">Classification</th><th className="th">Name</th><th className="th">Level</th><th className="th text-right">Materials</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td className="td text-ink-muted" colSpan={6}>No categories here yet</td></tr>}
              {shown.map((c) => [<Row key={c.id} c={c} />, ...c.children.map((s) => <Row key={s.id} c={s} sub />)])}
            </tbody>
          </table>
        </div>
      </div>
      {(modal?.isNew || modal?.cat || modal?.parent) && (
        <CategoryForm cat={modal.cat} parent={modal.parent} defaultClass={tab && tab !== 'NONE' ? tab : ''}
          onClose={() => setModal(null)} onDone={() => done('Category saved')} />
      )}
      {modal?.del && <DeleteDialog label={modal.del.name} path={`/categories/${modal.del.id}`} onClose={() => setModal(null)} onDone={() => done()} />}
    </div>
  );
}
