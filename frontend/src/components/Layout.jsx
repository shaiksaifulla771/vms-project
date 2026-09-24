import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Boxes, ChevronDown, ChevronRight, ClipboardList, Database, Factory, FileBarChart, Menu, Settings as Cog } from 'lucide-react';
import { useApp } from '../lib/app-context';
import { Toast } from './ui';

// Order follows the system flow (company set-up such as Locations & WH lives in Settings): Master Data -> MPN -> BOM -> Inventory -> Planning -> Manufacturing -> Reports.
const NAV = [
  { title: 'Master Data', icon: Database, items: [
    { to: '/masters/materials', label: 'Materials' },
    { to: '/masters/products', label: 'Products' },
    { to: '/masters/vendors', label: 'Vendors' },
    { to: '/masters/mpns', label: 'MPNs' },
    { to: '/masters/boms', label: 'BOMs' },
  ] },
  { title: 'Inventory', icon: Boxes, items: [
    { to: '/inventory/stock', label: 'Stock' },
    { to: '/inventory/transfers', label: 'Transfers' },
    { to: '/inventory/stock-counts', label: 'Physical Stock Count' },
  ] },
  { title: 'Planning', icon: ClipboardList, items: [
    { to: '/planning/plans', label: 'Plans' },
    { to: '/planning/new', label: 'New Plan' },
  ] },
  { title: 'Manufacturing', icon: Factory, items: [
    { to: '/manufacturing/batches', label: 'Batches' },
    { to: '/manufacturing/new', label: 'Batch Entry' },
  ] },
  { title: 'Reports', icon: FileBarChart, items: [
    { to: '/reports/stock-balance', label: 'Stock Balance' },
    { to: '/reports/transactions', label: 'Transactions' },
    { to: '/reports/traceability', label: 'Traceability' },
  ] },
  { title: 'Settings', icon: Cog, items: [
    { to: '/settings', label: 'General', end: true },
    { to: '/settings/locations', label: 'Locations & WH' },
    { to: '/settings/categories', label: 'Categories' },
    { to: '/settings/uoms', label: 'UOMs' },
  ] },
];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const groupOf = (path) => NAV.find((g) => g.items.some((it) => (it.end ? path === it.to : path.startsWith(it.to))))?.title;

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

const linkCls = (isActive) => (isActive
  ? 'text-accent bg-accent-soft font-medium border-r-2 border-accent'
  : 'text-ink-soft hover:text-ink hover:bg-white');

function Sidebar({ collapsed }) {
  const { pathname } = useLocation();
  const current = groupOf(pathname);
  const [open, setOpen] = useState(() => store.get('erp.nav.open', current ? [current] : ['Master Data']));

  // Make sure the group of the page being shown is open.
  useEffect(() => {
    if (current && !open.includes(current)) setOpen((o) => [...o, current]);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { store.set('erp.nav.open', open); }, [open]);

  const toggle = (t) => setOpen((o) => (o.includes(t) ? o.filter((x) => x !== t) : [...o, t]));

  if (collapsed) {
    return (
      <nav className="w-14 shrink-0 border-r border-line bg-panel py-2 no-print sticky top-11 self-start h-[calc(100vh-2.75rem)] z-20">
        {NAV.map((g) => (
          <div key={g.title} className="relative group">
            <div className={`h-10 flex items-center justify-center cursor-default ${g.title === current ? 'text-accent' : 'text-ink-muted hover:text-ink'}`} title={g.title}>
              <g.icon size={17} />
            </div>
            <div className="hidden group-hover:block absolute left-full top-0 ml-px w-52 bg-white border border-line shadow-sm py-1 z-40">
              <div className="px-3 py-1 text-xs2 font-semibold uppercase tracking-wide text-ink-muted">{g.title}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `block px-3 py-1.5 text-[13px] ${linkCls(isActive)}`}>
                  {it.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="w-56 shrink-0 border-r border-line bg-panel py-2 no-print sticky top-11 self-start h-[calc(100vh-2.75rem)] overflow-y-auto">
      {NAV.map((g) => {
        const isOpen = open.includes(g.title);
        return (
          <div key={g.title} className="mb-0.5">
            <button type="button" onClick={() => toggle(g.title)} aria-expanded={isOpen}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium hover:bg-white ${g.title === current ? 'text-ink' : 'text-ink-soft'}`}>
              <g.icon size={15} className={g.title === current ? 'text-accent' : 'text-ink-muted'} />
              <span className="flex-1 text-left">{g.title}</span>
              {isOpen ? <ChevronDown size={14} className="text-ink-faint" /> : <ChevronRight size={14} className="text-ink-faint" />}
            </button>
            {isOpen && g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end}
                className={({ isActive }) => `block pl-10 pr-3 py-1.5 text-[13px] ${linkCls(isActive)}`}>
                {it.label}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { company, toast } = useApp();
  const [collapsed, setCollapsed] = useState(() => store.get('erp.nav.collapsed', false));
  useEffect(() => { store.set('erp.nav.collapsed', collapsed); }, [collapsed]);

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 h-11 shrink-0 flex items-center justify-between border-b border-line pr-4 bg-white no-print">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label="Toggle menu" className="h-11 w-14 flex items-center justify-center text-ink-soft hover:text-ink hover:bg-panel border-r border-line">
            <Menu size={18} />
          </button>
          <img src="/favicon.svg" alt="" className="h-5 w-5 ml-1" />
          <span className="font-semibold">{company?.name || 'ERP'}</span>
          <span className="text-ink-faint text-xs">Inventory · Planning · Manufacturing</span>
        </div>
        <ScopeBar />
      </header>
      <div className="flex-1 flex">
        <Sidebar collapsed={collapsed} />
        <main className="flex-1 min-w-0 bg-white">
          <Outlet />
        </main>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
