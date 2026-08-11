import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Database,
  Boxes,
  Cpu,
  CalendarClock,
  Factory,
  ShoppingBag,
  ShieldCheck,
  BarChart3,
  Settings,
  LogOut,
  X
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage, isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useAuth();

  // Streamlined Navigation Blueprint (Merged Master Structure)
  const menuItems = [
    { id: 'dashboard', name: '1. Executive Dashboard', icon: LayoutDashboard },
    { id: 'sites', name: '2. Network & Sites Governance', icon: Building2 },
    { id: 'vms', name: '3. VMS Workbench', icon: ShieldCheck },
    { id: 'masters', name: '4. Master Data & BOM', icon: Database },
    { id: 'inventory', name: '5. Inventory Management', icon: Boxes },
    { id: 'planning', name: '6. MRP & Planning', icon: Cpu },
    { id: 'production', name: '7. Production & Operations', icon: Factory },
    { id: 'purchasing', name: '8. Procurement & Vendors', icon: ShoppingBag },
    { id: 'quality', name: '9. Quality Control & Reports', icon: BarChart3 },
    { id: 'settings', name: '10. Activity & System Audit', icon: Settings }
  ];

  const handleSelectModule = (id) => {
    setActivePage(id);
    setIsCollapsed(true);
  };

  return (
    <>
      {/* Overlay backdrop when sidebar menu is active */}
      {!isCollapsed && (
        <div
          onClick={() => setIsCollapsed(true)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[9990] transition-opacity duration-300"
        />
      )}

      <aside
        className={`w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-screen fixed left-0 top-0 z-[9999] transition-transform duration-300 ease-in-out shadow-2xl ${
          isCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Brand logo & close button header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between min-h-[64px]">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shrink-0 shadow-lg shadow-blue-500/20">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-wider leading-tight uppercase">VendorOS</h1>
              <span className="text-[9px] text-blue-400 font-bold tracking-widest uppercase">Enterprise ERP</span>
            </div>
          </div>

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700/60"
            title="Hide Module Menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation menu list */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Select Module (Full Screen)
          </p>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id || (activePage === 'users-access' && item.id === 'sites') || (activePage === 'bom' && item.id === 'masters') || (activePage === 'warehouse' && item.id === 'sites') || (activePage === 'mrp' && item.id === 'planning');

            return (
              <button
                key={item.id}
                onClick={() => handleSelectModule(item.id)}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-extrabold'
                    : 'hover:bg-slate-800/80 hover:text-slate-100 text-slate-400'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                  isActive ? 'text-white scale-110' : 'text-slate-400 group-hover:text-slate-200 group-hover:scale-110'
                }`} />
                <span className="truncate text-left">{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile & Logout footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex flex-col space-y-2.5">
          {user && (
            <div className="flex items-center space-x-3 w-full">
              <div className="h-8 w-8 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">{user.username || 'Admin User'}</p>
                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider block">
                  {user.role || 'Admin'}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="flex items-center justify-center w-full px-3 py-2 space-x-2 bg-slate-800 hover:bg-rose-900/40 hover:border-rose-700/50 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-bold transition-all border border-slate-700/60"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
