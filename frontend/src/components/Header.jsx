import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSiteContext } from '../context/SiteContext';
import { Menu, Bell, UserCheck, CheckCircle2, XCircle, Building2 } from 'lucide-react';

const Header = ({ activePage, sidebarCollapsed, setSidebarCollapsed }) => {
  const { user } = useAuth();
  const {
    sites,
    filteredWarehouses,
    activeSiteId,
    activeWarehouseId,
    setActiveSiteId,
    setActiveWarehouseId,
    loading: locationsLoading
  } = useSiteContext();

  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingUserRequests, setPendingUserRequests] = useState([
    {
      id: 'req-101',
      username: 'Amit Malhotra',
      email: 'amit.m@vendoros.com',
      requestedRole: 'Inventory Manager',
      site: 'Hyderabad Plant',
      timestamp: '10m ago'
    }
  ]);
  const [notice, setNotice] = useState(null);

  const getPageTitle = () => {
    switch (activePage) {
      case 'materials': return 'Materials Master';
      case 'vendors': return 'Vendors Master';
      case 'mpns': return 'MPN Master';
      case 'masters': return 'Master Data';
      case 'inventory': return 'Physical Stock & Inventory';
      case 'bom':
      case 'boms': return 'Bill of Materials (BOM)';
      case 'bom-new': return 'Create Recipe (BOM)';
      case 'planning':
      case 'mrp': return 'MRP & Material Planning';
      case 'sites':
      case 'network-sites': return 'Sites & Warehouses';
      case 'classifications': return 'Categories & Classifications';
      case 'material-classifications': return 'Material Classification';
      case 'vendor-classifications': return 'Vendor Classification';
      case 'users':
      case 'users-access': return 'Identity & Access Management';
      default: return 'VendorOS ERP';
    }
  };

  const handleApproveUser = (id, name) => {
    setPendingUserRequests(pendingUserRequests.filter(r => r.id !== id));
    setNotice(`Approved ${name}.`);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleRejectUser = (id, name) => {
    setPendingUserRequests(pendingUserRequests.filter(r => r.id !== id));
    setNotice(`Rejected ${name}.`);
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <header className="bg-white border-b border-slate-200 h-11 flex items-center justify-between px-3 fixed left-0 right-0 top-0 z-30 font-sans shadow-2xs">
      <div className="flex items-center space-x-2.5">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded text-xs font-bold transition-colors"
          title="Open Menu"
        >
          <Menu className="h-3.5 w-3.5" />
          <span>Modules</span>
        </button>

        <div className="flex items-center space-x-2 border-l border-slate-200 pl-2.5">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight hidden sm:block">{getPageTitle()}</h2>
        </div>
      </div>

      {/* SITE & WAREHOUSE SCOPE SELECTOR */}
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-xs">
        <Building2 className="w-3.5 h-3.5 text-blue-600 hidden md:block" />

        <select
          value={activeSiteId}
          onChange={(e) => setActiveSiteId(e.target.value)}
          disabled={locationsLoading}
          className="py-0.5 bg-transparent border-0 text-[11px] font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[180px]"
          title="Switch Facility"
        >
          <option value="">All Plants (Global)</option>
          {sites.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>

        <span className="text-slate-300 font-bold hidden sm:inline">/</span>

        <select
          value={activeWarehouseId || 'all'}
          onChange={(e) => setActiveWarehouseId(e.target.value === 'all' ? '' : e.target.value)}
          disabled={locationsLoading}
          className="py-0.5 bg-transparent border-0 text-[11px] font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[160px]"
          title="Switch Warehouse"
        >
          <option value="all">All Warehouses</option>
          {filteredWarehouses.map((w) => (
            <option key={w._id} value={w._id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center space-x-2 text-xs relative">
        {/* NOTIFICATION POPUP */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-1.5 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors border border-slate-200"
          title="Notifications"
        >
          <Bell className="h-3.5 w-3.5 text-slate-600" />
          {pendingUserRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
              {pendingUserRequests.length}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute right-8 top-9 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 space-y-2.5 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <div className="flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                <h3 className="font-bold text-xs text-slate-900">Pending Approvals</h3>
              </div>
              <button onClick={() => setShowNotifications(false)} className="text-slate-400 font-bold text-xs">✕</button>
            </div>

            {notice && (
              <div className="p-1.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded border border-emerald-200">
                {notice}
              </div>
            )}

            {pendingUserRequests.length > 0 ? (
              <div className="space-y-2">
                {pendingUserRequests.map((req) => (
                  <div key={req.id} className="p-2 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{req.username}</h4>
                        <p className="text-[10px] text-slate-500 font-mono">{req.email}</p>
                      </div>
                      <span className="text-[9px] text-slate-400">{req.timestamp}</span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => handleApproveUser(req.id, req.username)}
                        className="flex-1 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectUser(req.id, req.username)}
                        className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[10px] rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-slate-400 text-xs italic">
                No pending requests.
              </div>
            )}
          </div>
        )}

        <div className="h-4 border-l border-slate-200 hidden sm:block"></div>

        <div className="text-right hidden sm:block">
          <span className="font-extrabold text-slate-900 block text-xs leading-none">{user?.username || 'User'}</span>
          <span className="text-[9px] text-slate-400 font-bold block leading-none mt-0.5">{user?.role || 'Admin'}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
