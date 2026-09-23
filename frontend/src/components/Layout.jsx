import { NavLink, Outlet } from 'react-router-dom';
import { Boxes, ClipboardList, Factory, Database, FileBarChart, Settings as Cog } from 'lucide-react';
import { useApp } from '../lib/app-context';
import { Toast } from './ui';

const NAV = [
  { title: 'Inventory', icon: Boxes, items: [
    { to: '/inventory/stock', label: 'Stock' },
    { to: '/inventory/transfers', label: 'Transfers' },
  ] },
  { title: 'Planning', icon: ClipboardList, items: [
    { to: '/planning/plans', label: 'Plans' },
    { to: '/planning/new', label: 'New Plan' },
  ] },
  { title: 'Manufacturing', icon: Factory, items: [
    { to: '/manufacturing/batches', label: 'Batches' },
    { to: '/manufacturing/new', label: 'Batch Entry' },
  ] },
  { title: 'Master Data', icon: Database, items: [
    { to: '/masters/materials', label: 'Materials' },
    { to: '/masters/mpns', label: 'MPN & Vendors' },
    { to: '/masters/vendors', label: 'Vendors' },
    { to: '/masters/boms', label: 'BOMs' },
    { to: '/masters/locations', label: 'Locations & WH' },
  ] },
  { title: 'Reports', icon: FileBarChart, items: [
    { to: '/reports/stock-balance', label: 'Stock Balance' },
    { to: '/reports/physical-sheet', label: 'Physical Stock Sheet' },
    { to: '/reports/transactions', label: 'Transactions' },
    { to: '/reports/traceability', label: 'Traceability' },
  ] },
];

function ScopeBar() {
  const { locations, locationId, warehouseId, setLocationId, setWarehouseId, location, users, user, switchUser } = useApp();
  return (
    <div className="flex items-center gap-2">
      <select className="input h-7 w-52" value={locationId} onChange={(e) => setLocationId(e.target.value)} title="Location">
        <option value="">All locations</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
      </select>
      <select className="input h-7 w-44" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={!location} title="Warehouse">
        <option value="">All warehouses</option>
        {(location?.warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
      </select>
      <span className="w-px h-5 bg-line mx-1" />
      <select className="input h-7 w-56" value={user?.id || ''} onChange={(e) => switchUser(e.target.value)} title="Acting as (no login)">
        {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
      </select>
    </div>
  );
}

export default function Layout() {
  const { company, toast, isAdmin } = useApp();
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 h-11 shrink-0 flex items-center justify-between border-b border-line px-4 bg-white no-print">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-5 w-5" />
          <span className="font-semibold">{company?.name || 'ERP'}</span>
          <span className="text-ink-faint text-xs">Inventory · Planning · Manufacturing</span>
        </div>
        <ScopeBar />
      </header>
      <div className="flex-1 flex">
        <nav className="w-52 shrink-0 border-r border-line bg-panel py-2 no-print sticky top-11 self-start h-[calc(100vh-2.75rem)] overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="flex items-center gap-2 px-4 py-1 text-xs2 font-semibold uppercase tracking-wide text-ink-muted">
                <g.icon size={13} /> {g.title}
              </div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to}
                  className={({ isActive }) => `block pl-9 pr-3 py-1.5 text-[13px] ${isActive ? 'text-accent bg-accent-soft font-medium border-r-2 border-accent' : 'text-ink-soft hover:text-ink hover:bg-white'}`}>
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
          <NavLink to="/settings"
            className={({ isActive }) => `flex items-center gap-2 px-4 py-1.5 text-[13px] ${isActive ? 'text-accent font-medium' : 'text-ink-soft hover:text-ink'}`}>
            <Cog size={13} /> Settings {isAdmin ? '' : '(view)'}
          </NavLink>
        </nav>
        <main className="flex-1 min-w-0 bg-white">
          <Outlet />
        </main>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
