import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Boxes,
  Building2,
  Layers,
  Package,
  Settings,
  LogOut,
  X,
  UserCheck,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Tag,
  Database,
  FileSpreadsheet,
  PlusCircle
} from 'lucide-react';

const NAVIGATION_SECTIONS = [
  {
    id: 'master',
    title: 'Master',
    icon: Database,
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
    id: 'stocks',
    title: 'Stocks',
    icon: Package,
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
    id: 'bom',
    title: 'BOM',
    icon: FileSpreadsheet,
    items: [
      {
        id: 'bom',
        name: 'BOM Master',
        icon: FileSpreadsheet,
        roles: ['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner', 'Engineer']
      },
      {
        id: 'bom-new',
        name: 'Create Recipe',
        icon: PlusCircle,
        roles: ['Admin', 'Editor', 'Production', 'Production Manager', 'Planner', 'Engineer']
      }
    ]
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
    items: [
      {
        id: 'users',
        name: 'Users',
        icon: UserCheck,
        roles: ['Admin']
      },
      {
        id: 'material-classifications',
        name: 'Material Classification',
        icon: FolderTree,
        roles: ['Admin', 'Editor', 'Viewer']
      },
      {
        id: 'vendor-classifications',
        name: 'Vendor Classification',
        icon: Tag,
        roles: ['Admin', 'Editor', 'Viewer']
      }
    ]
  }
];

const Sidebar = ({ activePage, setActivePage, isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useAuth();
  const [expandedSection, setExpandedSection] = useState('master');
  const userRole = user?.role || 'Viewer';

  const isItemActive = (itemId) => {
    return (
      activePage === itemId ||
      (itemId === 'materials' && (activePage === 'masters' || activePage === 'master')) ||
      (itemId === 'mpns' && activePage === 'mpn') ||
      (itemId === 'bom' && (activePage === 'boms' || activePage === 'bom')) ||
      (itemId === 'bom-new' && activePage === 'bom-new') ||
      (itemId === 'material-classifications' && activePage === 'classifications') ||
      (itemId === 'vendor-classifications' && activePage === 'vendor-classifications') ||
      (itemId === 'users' && (activePage === 'users-access' || activePage === 'admin'))
    );
  };

  const handleToggleSection = (sectionId) => {
    setExpandedSection(prev => prev === sectionId ? null : sectionId);
  };

  const handleSelectModule = (id) => {
    setActivePage(id);
    setIsCollapsed(true);
  };

  // Find active section without recalculating loops repeatedly
  const currentExpanded = expandedSection ?? 'master';

  return (
    <>
      {!isCollapsed && (
        <div
          onClick={() => setIsCollapsed(true)}
          className="fixed inset-0 bg-slate-950/40 z-[9990] transition-opacity"
        />
      )}

      <aside
        className={`w-56 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-screen fixed left-0 top-0 z-[9999] transition-transform duration-150 ease-out shadow-2xl font-sans ${
          isCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Brand header */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between min-h-[48px]">
          <div className="flex items-center space-x-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 shadow-xs">
              <Boxes className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-xs font-black text-white tracking-wide uppercase">VendorOS</h1>
            </div>
          </div>

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Close menu"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2.5 space-y-1 overflow-y-auto custom-scrollbar">
          {NAVIGATION_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;

            const SectionIcon = section.icon;
            const isExpanded = currentExpanded === section.id;
            const hasActiveChild = visibleItems.some(item => isItemActive(item.id));

            return (
              <div key={section.id} className="select-none">
                <button
                  onClick={() => handleToggleSection(section.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-colors ${
                    hasActiveChild
                      ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                      : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <SectionIcon className={`h-3.5 w-3.5 shrink-0 ${hasActiveChild ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span>{section.title}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="ml-3 pl-2.5 border-l border-slate-700/60 space-y-0.5 py-1">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = isItemActive(item.id);

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelectModule(item.id)}
                          className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white font-bold shadow-xs'
                              : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                          <span className="truncate text-left">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User profile & Logout */}
        <div className="p-2 border-t border-slate-800 bg-slate-950/40 flex flex-col space-y-1.5">
          {user && (
            <div className="flex items-center space-x-2 w-full px-1">
              <div className="h-6 w-6 rounded bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-[10px] shrink-0">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate leading-tight">{user.username || 'User'}</p>
                <span className="text-[9px] text-slate-400 font-medium block">{user.role || 'Admin'}</span>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="flex items-center justify-center w-full px-2 py-1 space-x-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 rounded text-[10px] font-bold transition-colors"
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
