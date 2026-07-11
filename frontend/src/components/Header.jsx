import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Menu, Factory } from 'lucide-react';

const Header = ({ activePage, sidebarCollapsed, setSidebarCollapsed }) => {
  const { user } = useAuth();

  const getPageTitle = () => {
    switch (activePage) {
      case 'dashboard': return 'Dashboard KPI Overview';
      case 'masters': return 'ERP Masters (Materials & Vendors)';
      case 'boms': return 'Bill of Materials (BOM) Recipes';
      case 'planning': return 'MRP Planning (Stock Availability Check)';
      case 'inventory': return 'Warehouse Inventory Ledger';
      case 'purchasing': return 'Procurement & Purchase Orders';
      case 'manufacturing': return 'Manufacturing Shop Floor Operations';
      case 'quality': return 'QC Inspection & Quality Gates';
      case 'reports': return 'Executive Analytics Reports';
      case 'settings': return 'System Settings & Roles Matrix';
      default: return 'Manufacturing ERP System';
    }
  };

  return (
    <header className={`bg-white border-b border-slate-100 h-16 flex items-center justify-between px-6 fixed right-0 top-0 ${
      sidebarCollapsed ? 'left-0' : 'left-64'
    } z-30 shadow-sm shadow-slate-100/40 transition-all duration-300`}>
      <div className="flex items-center">
        {/* Floating navbar menu drawer switch */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors mr-2"
          title={sidebarCollapsed ? "Open sidebar menu" : "Close sidebar menu"}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Small matching brand logo */}
        <div className="bg-blue-600 p-1.5 rounded text-white shrink-0 mr-2.5 flex items-center justify-center">
          <Factory className="h-4 w-4" />
        </div>

        <h2 className="text-sm font-bold text-slate-800 tracking-tight">{getPageTitle()}</h2>
      </div>

      <div className="flex items-center space-x-4">
        {user && user.role === 'Admin' && (
          <div className="hidden sm:flex items-center space-x-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-semibold border border-red-100">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Superuser Administrative Clearance</span>
          </div>
        )}
        
        <div className="h-8 border-l border-slate-100 hidden sm:block"></div>

        <div className="flex items-center space-x-2">
          <div className="text-right hidden md:block">
            <p className="text-xs font-bold text-slate-700">{user?.username}</p>
            <p className="text-[10px] text-slate-400 font-medium">{user?.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
