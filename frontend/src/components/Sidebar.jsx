import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Database,
  ClipboardList,
  Cpu,
  Boxes,
  ShoppingBag,
  Factory,
  ShieldCheck,
  BarChart3,
  LogOut,
  Settings,
  MoreVertical,
  Menu
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage, isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useAuth();

  const allMenuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Inventory Manager', 'Production Manager'] },
    { id: 'masters', name: 'ERP Masters', icon: Database, roles: ['Admin', 'Inventory Manager'] },
    { id: 'boms', name: 'Bill of Materials', icon: ClipboardList, roles: ['Admin', 'Production Manager'] },
    { id: 'planning', name: 'MRP Planning', icon: Cpu, roles: ['Admin', 'Inventory Manager', 'Production Manager'] },
    { id: 'inventory', name: 'Inventory Ledger', icon: Boxes, roles: ['Admin', 'Inventory Manager'] },
    { id: 'purchasing', name: 'Procurement (POs)', icon: ShoppingBag, roles: ['Admin', 'Inventory Manager'] },
    { id: 'manufacturing', name: 'Manufacturing', icon: Factory, roles: ['Admin', 'Production Manager'] },
    { id: 'quality', name: 'Quality Control', icon: ShieldCheck, roles: ['Admin', 'Production Manager'] },
    { id: 'reports', name: 'ERP Reports', icon: BarChart3, roles: ['Admin', 'Inventory Manager', 'Production Manager'] },
    { id: 'settings', name: 'Settings & Roles', icon: Settings, roles: ['Admin', 'Inventory Manager', 'Production Manager'] }
  ];

  const menuItems = allMenuItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div 
      className={`w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-screen fixed left-0 top-0 z-40 transition-all duration-300 ${
        isCollapsed ? '-translate-x-full' : 'translate-x-0'
      }`}
    >
      {/* Brand logo header */}
      <div className={`p-4 border-b border-slate-800 flex items-center ${isCollapsed ? 'flex-col space-y-3 justify-center' : 'justify-between'} min-h-[73px]`}>
        <div className="flex items-center space-x-2.5">
          <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
            <Factory className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="transition-opacity duration-300">
              <h1 className="text-sm font-bold text-white tracking-wide leading-tight">ERP Portal</h1>
              <span className="text-[9px] text-slate-400 font-bold tracking-wider uppercase">Manufacturing</span>
            </div>
          )}
        </div>

        {/* Pin/Unpin sidebar toggle using dots menu */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <Menu className="h-4.5 w-4.5" /> : <MoreVertical className="h-4.5 w-4.5" />}
        </button>
      </div>

      {/* Menu links */}
      <nav className={`flex-1 ${isCollapsed ? 'px-2' : 'px-4'} py-5 space-y-1 overflow-y-auto`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                setActivePage(item.id);
                setIsCollapsed(true); // Automatically hide sidebar drawer on selection
              }}
              title={isCollapsed ? item.name : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-2 py-3' : 'space-x-3 px-4 py-2.5'
              } rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <Icon className={`h-4.5 w-4.5 transition-transform duration-200 ${
                isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200 group-hover:scale-105'
              }`} />
              {!isCollapsed && <span className="truncate">{item.name}</span>}
            </button>
          );
        })}
      </nav>

      {/* User profile details & logout */}
      <div className={`p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col ${isCollapsed ? 'items-center space-y-4' : 'space-y-3'}`}>
        {user && (
          <div className={`flex ${isCollapsed ? 'flex-col items-center justify-center' : 'items-center space-x-3'} w-full`}>
            <div className="h-9 w-9 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0 transition-opacity duration-300">
                <p className="text-xs font-bold text-white truncate leading-none">{user.username}</p>
                <div className="flex items-center space-x-1 mt-1">
                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 tracking-wider uppercase leading-none">
                    {user.role}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={logout}
          title={isCollapsed ? 'Sign Out' : undefined}
          className={`flex items-center justify-center ${
            isCollapsed ? 'p-2 w-9 h-9' : 'w-full px-4 py-2 space-x-2'
          } bg-slate-800 hover:bg-slate-700/80 hover:text-white rounded-lg text-xs font-semibold tracking-wide transition-all border border-slate-700/50`}
        >
          <LogOut className="h-3.5 w-3.5" />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
