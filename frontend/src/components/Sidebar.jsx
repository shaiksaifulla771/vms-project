import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Database,
  Layers,
  Boxes,
  Cpu,
  Factory,
  CalendarClock,
  ShoppingBag,
  ShieldCheck,
  BarChart3,
  Settings,
  LogOut,
  X,
  UserCheck
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage, isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useAuth();

  const navigationSections = [
    {
      title: 'Master',
      items: [
        {
          id: 'materials',
          name: 'Materials',
          icon: Boxes,
          roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']
        },
        {
          id: 'vendors',
          name: 'Vendors',
          icon: Building2,
          roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']
        }
      ]
    },
    {
      title: 'Stocks',
      items: [
        {
          id: 'mpns',
          name: 'MPN',
          icon: Layers,
          roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']
        },
        {
          id: 'inventory',
          name: 'Inventory',
          icon: Boxes,
          roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Planner']
        }
      ]
    },
    {
      title: 'Engineering & Infra',
      items: [
        {
          id: 'boms',
          name: 'BOM & Recipes',
          icon: Layers,
          roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']
        },
        {
          id: 'planning',
          name: 'MRP & Planning',
          icon: Cpu,
          roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']
        },
        {
          id: 'sites',
          name: 'Sites & Warehouses',
          icon: Building2,
          roles: ['Admin', 'Editor']
        }
      ]
    },
    {
      title: 'Settings',
      items: [
        {
          id: 'classifications',
          name: 'Classifications',
          icon: Settings,
          roles: ['Admin', 'Editor', 'Viewer']
        },
        {
          id: 'users',
          name: 'Users',
          icon: UserCheck,
          roles: ['Admin']
        }
      ]
    }
  ];

  const userRole = user?.role || 'Viewer';

  const handleSelectModule = (id) => {
    setActivePage(id);
    setIsCollapsed(true);
  };

  return (
    <>
      {/* Overlay backdrop when sidebar menu is open on mobile/compact */}
      {!isCollapsed && (
        <div
          onClick={() => setIsCollapsed(true)}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-[9990] transition-opacity duration-200"
        />
      )}

      <aside
        className={`w-60 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-screen fixed left-0 top-0 z-[9999] transition-transform duration-200 ease-in-out shadow-2xl ${
          isCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Brand header */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between min-h-[52px]">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 shadow-md">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
                <path d="M24 4L42 14L24 24L6 14L24 4Z" fill="#60A5FA" />
                <path d="M6 14L24 24V44L6 34V14Z" fill="#1D4ED8" />
                <path d="M24 24L42 14V34L24 44V24Z" fill="#3B82F6" />
              </svg>
            </div>
            <div>
              <h1 className="text-xs font-extrabold text-white tracking-wide uppercase">VMS ERP</h1>
              <span className="text-[8px] text-blue-400 font-bold uppercase tracking-wider">Enterprise</span>
            </div>
          </div>

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Close menu"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Navigation links grouped by sections */}
        <nav className="flex-1 px-2 py-2 space-y-3 overflow-y-auto">
          {navigationSections.map((section) => {
            const visibleItems = section.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="space-y-0.5">
                <p className="px-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  {section.title}
                </p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    activePage === item.id ||
                    (item.id === 'materials' && (activePage === 'masters' || activePage === 'master')) ||
                    (item.id === 'boms' && activePage === 'bom') ||
                    (item.id === 'planning' && activePage === 'mrp') ||
                    (item.id === 'sites' && (activePage === 'network-sites' || activePage === 'warehouse')) ||
                    (item.id === 'users' && (activePage === 'users-access' || activePage === 'admin'));

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectModule(item.id)}
                      className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm font-black'
                          : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate text-left">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User profile & Logout */}
        <div className="p-2 border-t border-slate-800 bg-slate-950/40 flex flex-col space-y-1.5">
          {user && (
            <div className="flex items-center space-x-2.5 w-full px-1">
              <div className="h-6 w-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center font-black text-[10px] shrink-0">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate leading-tight">{user.username || 'User'}</p>
                <span className="text-[8px] text-slate-400 font-semibold block">{user.role || 'Admin'}</span>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="flex items-center justify-center w-full px-2 py-1 space-x-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 rounded-md text-[10px] font-bold transition-colors"
          >
            <LogOut className="h-3 w-3 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
