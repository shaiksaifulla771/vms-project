import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Menu, RefreshCw, Bell, UserCheck, CheckCircle2, XCircle, ChevronRight, ShieldAlert } from 'lucide-react';

const Header = ({ activePage, sidebarCollapsed, setSidebarCollapsed, navigateToPage }) => {
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingUserRequests, setPendingUserRequests] = useState([
    {
      id: 'req-101',
      username: 'Amit Malhotra',
      email: 'amit.m@vendoros.com',
      requestedRole: 'Inventory Manager',
      site: 'Hyderabad Plant',
      timestamp: '10 mins ago'
    },
    {
      id: 'req-102',
      username: 'Sneha Patel',
      email: 'sneha.p@vendoros.com',
      requestedRole: 'QC Inspector',
      site: 'Bangalore Plant',
      timestamp: '25 mins ago'
    }
  ]);
  const [notice, setNotice] = useState(null);

  const getPageTitle = () => {
    switch (activePage) {
      case 'dashboard': return 'Dashboard';
      case 'sites': return 'Network & Sites Governance';
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
    window.location.reload();
  };

  const handleApproveUser = (id, name) => {
    setPendingUserRequests(pendingUserRequests.filter(r => r.id !== id));
    setNotice(`Approved user registration for ${name}. Account activated.`);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleRejectUser = (id, name) => {
    setPendingUserRequests(pendingUserRequests.filter(r => r.id !== id));
    setNotice(`Rejected user registration for ${name}.`);
    setTimeout(() => setNotice(null), 3000);
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

      <div className="flex items-center space-x-3 text-xs relative">
        {/* NOTIFICATION BELL WITH LIVE BADGE */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200"
          title="User Approval & Registration Notifications"
        >
          <Bell className="h-4 w-4 text-slate-700" />
          {pendingUserRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
              {pendingUserRequests.length}
            </span>
          )}
        </button>

        {/* NOTIFICATIONS DROPDOWN POPOVER */}
        {showNotifications && (
          <div className="absolute right-12 top-11 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-1.5">
                <UserCheck className="w-4 h-4 text-orange-600" />
                <h3 className="font-extrabold text-xs text-slate-900">Pending User Approvals ({pendingUserRequests.length})</h3>
              </div>
              <button onClick={() => setShowNotifications(false)} className="text-slate-400 font-bold text-xs">✕</button>
            </div>

            {notice && (
              <div className="p-2 bg-emerald-50 text-emerald-800 text-[11px] font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{notice}</span>
              </div>
            )}

            {pendingUserRequests.length > 0 ? (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {pendingUserRequests.map((req) => (
                  <div key={req.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{req.username}</h4>
                        <p className="text-[11px] font-mono text-slate-500">{req.email}</p>
                        <p className="text-[10px] text-slate-600 font-semibold pt-0.5">Role: <span className="text-orange-600 font-bold">{req.requestedRole}</span> • {req.site}</p>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400">{req.timestamp}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                      <button
                        onClick={() => handleApproveUser(req.id, req.username)}
                        className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-md shadow-2xs transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() => handleRejectUser(req.id, req.username)}
                        className="flex-1 py-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[11px] rounded-md transition-colors flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs italic bg-slate-50 rounded-lg border border-slate-100">
                No pending user registration requests at this moment. All user accounts are approved.
              </div>
            )}
          </div>
        )}

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
          <span className="font-bold text-slate-800 block leading-tight">{user?.username || 'Shaik Saifulla'}</span>
          <span className="text-[10px] text-slate-400 font-medium block leading-tight">{user?.role || 'System Admin'}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
