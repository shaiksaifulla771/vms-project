import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Menu, RefreshCw } from 'lucide-react';

const Header = ({ activePage, sidebarCollapsed, setSidebarCollapsed }) => {
  const { user } = useAuth();

  const getPageTitle = () => {
    switch (activePage) {
      case 'dashboard': return 'Dashboard';
      case 'masters': return 'Master Data';
      case 'boms': return 'BOM Recipes';
      case 'planning': return 'MRP & Planning';
      case 'inventory': return 'Inventory Ledger';
      case 'purchasing': return 'Procurement';
      case 'production': return 'Production Operations';
      case 'manufacturing': return 'Production Operations';
      case 'scheduling': return 'Scheduling Workbench';
      case 'quality': return 'Quality Control';
      case 'reports': return 'Reports';
      case 'settings': return 'Settings';
      default: return 'VendorOS ERP';
    }
  };

  const handleRefresh = () => {
    // Trigger window location reload or custom event
    window.location.reload();
  };

  return (
    <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-5 fixed left-0 right-0 top-0 z-30 shadow-xs">
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          title="Open Modules Menu"
        >
          <Menu className="h-4 w-4" />
          <span>Modules</span>
        </button>

        <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
          <h2 className="text-sm font-bold text-slate-800">{getPageTitle()}</h2>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors flex items-center space-x-1.5 px-2.5 text-xs font-bold border border-slate-200"
          title="Refresh Data & View"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <div className="h-6 border-l border-slate-200 hidden sm:block"></div>

        <div className="text-right hidden sm:block">
          <span className="font-bold text-slate-800 block leading-tight">{user?.username || 'User'}</span>
          <span className="text-[10px] text-slate-400 font-medium block leading-tight">{user?.role || 'Admin'}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
