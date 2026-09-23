import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/app-context';
import { ErrorBox, Field, PageHeader } from '../components/ui';

export default function SettingsPage() {
  const { settings, company, users, isAdmin, reload, notify } = useApp();
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (settings) setF({ ...settings, company_name: company?.name || '' });
  }, [settings, company]);
  if (!f) return null;

  const save = async () => {
    setErr(null);
    try {
      await api.put('/settings', {
        variance_tolerance_pct: Number(f.variance_tolerance_pct), apply_scrap_allowance: f.apply_scrap_allowance,
        default_shelf_life_days: Number(f.default_shelf_life_days), company_name: f.company_name,
      });
      notify('Settings saved');
      reload();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle={isAdmin ? 'Global rules used by planning and manufacturing' : 'Read only - Admin role required to change settings'}
        actions={isAdmin && <button type="button" className="btn-primary" onClick={save}>Save</button>} />
      <div className="p-5 space-y-4 max-w-3xl">
        <ErrorBox message={err} onClose={() => setErr(null)} />
        <section className="card p-4 grid grid-cols-2 gap-4">
          <Field label="Company Name"><input className="input" disabled={!isAdmin} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></Field>
          <div />
          <Field label="Variance Tolerance (%)" hint="Actual vs plan beyond this needs a reason (Admins can override)">
            <input className="input num" type="number" min="0" max="100" step="0.1" disabled={!isAdmin} value={f.variance_tolerance_pct}
              onChange={(e) => setF({ ...f, variance_tolerance_pct: e.target.value })} />
          </Field>
          <Field label="Default Shelf Life (days)" hint="Used when a material has no shelf life">
            <input className="input num" type="number" min="1" disabled={!isAdmin} value={f.default_shelf_life_days}
              onChange={(e) => setF({ ...f, default_shelf_life_days: e.target.value })} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-ink-soft">
            <input type="checkbox" disabled={!isAdmin} checked={f.apply_scrap_allowance} onChange={(e) => setF({ ...f, apply_scrap_allowance: e.target.checked })} />
            Include BOM scrap allowance in material requirements by default (can be changed per plan; off = Qty per Batch × Batches)
          </label>
        </section>

        <section className="card">
          <div className="px-3 py-2 border-b border-line font-semibold">Users (no-login mode)</div>
          <div className="px-3 py-2 text-xs text-ink-muted">Choose who you are acting as in the top bar. Roles are managed in Supabase (user_profiles): admin = full access incl. stock adjustments, plan target changes and tolerance override; editor = day-to-day transactions; viewer = read only.</div>
          <table className="w-full">
            <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><td className="td">{u.full_name}</td><td className="td">{u.email}</td><td className="td">{u.role}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
