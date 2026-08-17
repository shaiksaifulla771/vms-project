import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Database,
  Boxes,
  Cpu,
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

  // Clean, professional navigation structure
  const allMenuItems = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Viewer']
    },
    {
      id: 'sites',
      name: 'Sites & Warehouses',
      icon: Building2,
      roles: ['Admin']
    },
    {
      id: 'masters',
      name: 'Master Data & BOM',
      icon: Database,
      roles: ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance', 'Viewer']
    },
    {
      id: 'inventory',
      name: 'Inventory',
      icon: Boxes,
      roles: ['Admin', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Planner']
    },
    {
      id: 'planning',
      name: 'MRP & Planning',
      icon: Cpu,
      roles: ['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']
    },
    {
      id: 'production',
      name: 'Production',
      icon: Factory,
      roles: ['Admin', 'Production', 'Production Manager']
    },
    {
      id: 'purchasing',
      name: 'Procurement',
      icon: ShoppingBag,
      roles: ['Admin', 'ProcurementManager', 'Purchaser', 'Vendor']
    },
    {
      id: 'quality',
      name: 'Quality & QC',
      icon: ShieldCheck,
      roles: ['Admin', 'Production', 'Production Manager', 'QC Inspector']
    },
    {
      id: 'reports',
      name: 'Reports & Analytics',
      icon: BarChart3,
      roles: ['Admin', 'Production', 'Production Manager', 'QC Inspector', 'Finance']
    },
    {
      id: 'vms',
      name: 'Visitor Management',
      icon: ShieldCheck,
      roles: ['Admin', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor']
    },
    {
      id: 'settings',
      name: 'System & Audit Logs',
      icon: Settings,
      roles: ['Admin']
    }
  ];

  const userRole = user?.role || 'Viewer';
  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole));

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
        className={`w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-screen fixed left-0 top-0 z-[9999] transition-transform duration-200 ease-in-out shadow-2xl ${
          isCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Brand header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between min-h-[60px]">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-md">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
                <path d="M24 4L42 14L24 24L6 14L24 4Z" fill="#60A5FA" />
                <path d="M6 14L24 24V44L6 34V14Z" fill="#1D4ED8" />
                <path d="M24 24L42 14V34L24 44V24Z" fill="#3B82F6" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white tracking-wide uppercase">VMS ERP</h1>
              <span className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">Enterprise Platform</span>
            </div>
          </div>

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          <p className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">
            Modules
          </p>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activePage === item.id ||
              (activePage === 'users-access' && item.id === 'sites') ||
              (activePage === 'bom' && item.id === 'masters') ||
              (activePage === 'warehouse' && item.id === 'sites') ||
              (activePage === 'mrp' && item.id === 'planning');

            return (
              <button
                key={item.id}
                onClick={() => handleSelectModule(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-black'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate text-left">{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile & Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex flex-col space-y-2">
          {user && (
            <div className="flex items-center space-x-3 w-full px-1">
              <div className="h-7 w-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">{user.username || 'User'}</p>
                <span className="text-[9px] text-slate-400 font-semibold block">{user.role || 'Admin'}</span>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="flex items-center justify-center w-full px-3 py-1.5 space-x-2 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 rounded-lg text-xs font-bold transition-colors"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
