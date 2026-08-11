import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  Warehouse,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  BellRing,
  Clock,
  RefreshCw,
  ShieldCheck,
  Server,
  ArrowUpRight,
  Filter,
  Eye,
  FileText
} from 'lucide-react';

const AdminControlCenter = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    metrics: {
      activeSites: 4,
      totalSites: 5,
      activeWarehouses: 12,
      totalWarehouses: 14,
      activeUsers: 38,
      todaysActivities: 126
    },
    operationalStatus: {
      sites: [],
      warehouses: []
    },
    recentActivity: [],
    systemHealth: {
      database: 'Healthy',
      api: 'Healthy',
      notifications: 'Healthy',
      backgroundJobs: 'Healthy',
      authentication: 'Healthy',
      lastSync: new Date().toLocaleTimeString()
    }
  });

  const [selectedLog, setSelectedLog] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/network-summary');
      if (res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.warn('Dashboard summary fallback to demo state:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-white">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
              Enterprise Admin
            </span>
            <span className="text-xs text-slate-400">Master Governance & Audit Control</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Admin Control Center</h1>
        </div>

        <button
          onClick={fetchDashboardData}
          className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-blue-600/30 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Feeds</span>
        </button>
      </div>

      {/* 4 TOP KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Sites */}
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Sites</span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-slate-900">{data.metrics.activeSites}</span>
            <span className="text-xs font-semibold text-slate-400">/ {data.metrics.totalSites} Total</span>
          </div>
          <p className="text-[11px] font-semibold text-emerald-600 mt-2 flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> All core plants operational
          </p>
        </div>

        {/* Active Warehouses */}
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Warehouses</span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <Warehouse className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-slate-900">{data.metrics.activeWarehouses}</span>
            <span className="text-xs font-semibold text-slate-400">/ {data.metrics.totalWarehouses} Total</span>
          </div>
          <p className="text-[11px] font-semibold text-amber-600 mt-2 flex items-center">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> 2 deactivated location records
          </p>
        </div>

        {/* Active Users */}
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Users</span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-slate-900">{data.metrics.activeUsers}</span>
            <span className="text-xs font-semibold text-emerald-600 font-bold">● Active Now</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-2">
            Inventory, Production & Planners online
          </p>
        </div>

        {/* Today's Activities */}
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Audit Events</span>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-slate-900">{data.metrics.todaysActivities}</span>
            <span className="text-xs font-semibold text-blue-600 font-bold">Logged</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-2">
            100% audit logging coverage active
          </p>
        </div>
      </div>

      {/* MIDDLE SECTION: OPERATIONAL STATUS & NOTIFICATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operational Status (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-blue-600" /> Operational Status Overview
            </h2>
            <span className="text-xs text-slate-400 font-semibold">Master Network & Locations</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sites List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
                <span>Sites</span>
                <span>Status</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {(data.operationalStatus.sites || [
                  { name: 'Hyderabad Plant', status: 'Active' },
                  { name: 'Bangalore Plant', status: 'Active' },
                  { name: 'Chennai Distribution', status: 'Active' },
                  { name: 'Pune Facility', status: 'Inactive' }
                ]).map((site, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-semibold">
                    <span className="font-bold text-slate-800">{site.name}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      site.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      ● {site.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warehouses List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
                <span>Warehouses</span>
                <span>Status</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {(data.operationalStatus.warehouses || [
                  { name: 'Main Warehouse', status: 'Active' },
                  { name: 'Raw Material Warehouse', status: 'Active' },
                  { name: 'Finished Goods Warehouse', status: 'Active' },
                  { name: 'Old Storage Depot', status: 'Inactive' }
                ]).map((wh, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-semibold">
                    <span className="font-bold text-slate-800">{wh.name}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      wh.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      ● {wh.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Notifications & System Alerts (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-black tracking-tight flex items-center">
                <BellRing className="w-5 h-5 mr-2 text-amber-400" /> Governance Alerts
              </h2>
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-md">Live</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Location Status</span>
                <p className="text-slate-200 font-semibold">Warehouse "Old Storage Depot" was deactivated by Admin.</p>
                <span className="text-[10px] text-slate-400">30 minutes ago</span>
              </div>

              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider">Access Scope</span>
                <p className="text-slate-200 font-semibold">User Rahul Kumar warehouse access updated to Main & Raw Material WH.</p>
                <span className="text-[10px] text-slate-400">1 hour ago</span>
              </div>

              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl space-y-1">
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">Master Data</span>
                <p className="text-slate-200 font-semibold">New site "Chennai Distribution Center" registered.</p>
                <span className="text-[10px] text-slate-400">2 hours ago</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            <a
              href="/settings"
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors border border-slate-700/60"
            >
              <span>View Full Audit & Activity</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: RECENT ACTIVITY AUDIT FEED */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center">
              <FileText className="w-5 h-5 mr-2 text-blue-600" /> Recent Audit Activity
            </h2>
            <p className="text-xs text-slate-500 font-medium">Real-time log of administrative and operational actions</p>
          </div>

          <a
            href="/settings"
            className="text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center"
          >
            Go to Audit Trail <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Details / Reason</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {(data.recentActivity && data.recentActivity.length > 0 ? data.recentActivity : [
                {
                  timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                  userName: 'Admin User',
                  role: 'Admin',
                  action: 'DEACTIVATE',
                  module: 'Network & Sites',
                  reason: 'Structure maintenance & obsolete inventory clearance',
                  locationName: 'Old Storage Depot'
                },
                {
                  timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                  userName: 'Rahul Kumar',
                  role: 'Inventory Manager',
                  action: 'UPDATE',
                  module: 'Inventory',
                  reason: 'Stock transfer for production batch #1042',
                  locationName: 'Raw Material Warehouse'
                },
                {
                  timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
                  userName: 'Ahmed Khan',
                  role: 'Planner',
                  action: 'CREATE',
                  module: 'VMS',
                  reason: 'Scheduled vendor dispatch appointment',
                  locationName: 'Hyderabad Plant'
                }
              ]).map((log, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{log.userName || log.userId?.username || 'System Admin'}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md">
                      {log.role || log.userId?.role || 'Admin'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase tracking-wider ${
                      log.action === 'DEACTIVATE' ? 'bg-rose-100 text-rose-700' :
                      log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                      log.action === 'TRANSFER_SITE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-600">{log.module || 'General'}</td>
                  <td className="py-3 px-4 max-w-xs truncate text-slate-500">{log.reason || 'Master configuration updated'}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                      title="Inspect Event"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LIVE SYSTEM HEALTH BAR */}
      <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-wide flex items-center">
              SYSTEM HEALTH STATUS <span className="ml-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">Last synchronization: {data.systemHealth.lastSync}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 rounded-xl border border-slate-800">
            <span className="text-slate-400">Database:</span>
            <span className="text-emerald-400">● {data.systemHealth.database}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 rounded-xl border border-slate-800">
            <span className="text-slate-400">API Gateway:</span>
            <span className="text-emerald-400">● {data.systemHealth.api}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 rounded-xl border border-slate-800">
            <span className="text-slate-400">Notifications:</span>
            <span className="text-emerald-400">● {data.systemHealth.notifications}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 rounded-xl border border-slate-800">
            <span className="text-slate-400">Background Worker:</span>
            <span className="text-emerald-400">● {data.systemHealth.backgroundJobs}</span>
          </div>
        </div>
      </div>

      {/* INSPECT EVENT MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Activity Inspection Details</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <div className="space-y-2 text-xs font-semibold text-slate-700">
              <p><strong>User:</strong> {selectedLog.userName || 'Admin'}</p>
              <p><strong>Role:</strong> {selectedLog.role || 'Admin'}</p>
              <p><strong>Action:</strong> {selectedLog.action}</p>
              <p><strong>Module:</strong> {selectedLog.module || 'General'}</p>
              <p><strong>Location:</strong> {selectedLog.locationName || 'N/A'}</p>
              <p><strong>Timestamp:</strong> {new Date(selectedLog.timestamp).toLocaleString()}</p>
              <p><strong>Reason:</strong> {selectedLog.reason || 'N/A'}</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl">
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminControlCenter;
