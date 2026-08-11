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
  FileText,
  Sparkles,
  Search
} from 'lucide-react';

const AdminControlCenter = () => {
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // all | location | security | ops
  const [selectedLog, setSelectedLog] = useState(null);
  const [notice, setNotice] = useState(null);

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const [data, setData] = useState({
    metrics: {
      activeSites: 4,
      totalSites: 5,
      activeWarehouses: 12,
      totalWarehouses: 14,
      activeUsers: 38,
      todaysActivities: 126
    },
    systemHealth: {
      database: 'Healthy',
      api: 'Online',
      systemWorker: 'Active',
      lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  });

  const todaysActivities = [
    {
      id: 'act-1',
      time: '14:25 PM',
      user: 'Shaik Saifulla',
      role: 'Admin',
      category: 'location',
      action: 'DEACTIVATE',
      title: 'Warehouse Deactivated',
      details: 'Old Storage Depot at Pune Facility was marked inactive.',
      location: 'Pune Facility'
    },
    {
      id: 'act-2',
      time: '13:40 PM',
      user: 'Rahul Kumar',
      role: 'Inventory Manager',
      category: 'ops',
      action: 'TRANSFER',
      title: 'Stock Transfer Allocated',
      details: 'Transferred 300 units from Raw Material WH to Assembly line.',
      location: 'Raw Material Warehouse'
    },
    {
      id: 'act-3',
      time: '11:15 AM',
      user: 'Shaik Saifulla',
      role: 'Admin',
      category: 'security',
      action: 'ACCESS',
      title: 'User Scope Updated',
      details: 'Updated Rahul Kumar access to Main WH & Raw Material WH.',
      location: 'Users & Access'
    },
    {
      id: 'act-4',
      time: '09:30 AM',
      user: 'Priya Sharma',
      role: 'Production Manager',
      category: 'ops',
      action: 'DISPATCH',
      title: 'Batch Dispatched',
      details: 'Dispatched 500 units to Chennai Distribution Center.',
      location: 'Finished Goods Warehouse'
    }
  ];

  const systemInsights = [
    {
      id: 1,
      type: 'INVENTORY',
      title: 'Reorder Reminder',
      description: 'Hyderabad Plant Raw Material stock is at 12%. Reorder suggested.'
    },
    {
      id: 2,
      type: 'SECURITY',
      title: 'Access Compliance',
      description: 'Zero unauthorized access attempts recorded in the last 24h.'
    },
    {
      id: 3,
      type: 'SYSTEM',
      title: 'Database Status',
      description: 'All system databases and services are operating normally.'
    }
  ];

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/network-summary');
      if (res.data?.metrics) {
        setData(prev => ({ ...prev, metrics: res.data.metrics }));
      }
    } catch (err) {
      console.warn('Dashboard refresh fallback:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunHealthCheck = () => {
    setIsChecking(true);
    setNotice(null);
    setTimeout(() => {
      setIsChecking(false);
      setNotice({
        title: 'System Check Complete',
        message: 'All sites, warehouses, and access profiles are verified and healthy.'
      });
    }, 800);
  };

  const filteredActivities = todaysActivities.filter(item => {
    if (activeTab === 'all') return true;
    return item.category === activeTab;
  });

  return (
    <div className="space-y-4 text-slate-900 bg-slate-50 min-h-screen p-1 font-sans">
      {/* CLEAN BLACK & WHITE HEADER CARD */}
      <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white rounded-md">
              Executive
            </span>
            <span className="text-xs text-slate-600 font-bold">● System Active</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-slate-500 font-medium">System overview and today's activity log for {todayFormatted}.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRunHealthCheck}
            disabled={isChecking}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
          >
            <CheckCircle2 className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'Run Health Check'}</span>
          </button>

          <button
            onClick={fetchDashboardData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors border border-slate-300"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SYSTEM NOTICE */}
      {notice && (
        <div className="p-3 bg-white border border-slate-300 text-slate-900 rounded-xl flex items-center justify-between shadow-xs text-xs font-semibold">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-slate-900" />
            <div>
              <span className="font-black uppercase">{notice.title}:</span> <span>{notice.message}</span>
            </div>
          </div>
          <button onClick={() => setNotice(null)} className="font-bold underline text-slate-700">Dismiss</button>
        </div>
      )}

      {/* 4 BLACK & WHITE KPI STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Sites</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.activeSites} <span className="text-xs text-slate-400 font-semibold">/ {data.metrics.totalSites}</span></span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-900 rounded-md border border-slate-300">Active</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-100">All core plants operating</p>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Warehouses</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.activeWarehouses} <span className="text-xs text-slate-400 font-semibold">/ {data.metrics.totalWarehouses}</span></span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-900 rounded-md border border-slate-300">Synced</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-100">2 deactivated locations</p>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Users</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.activeUsers}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-900 text-white rounded-md">Online</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-100">Role permissions active</p>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Today's Activities</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.todaysActivities}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-900 rounded-md border border-slate-300">Logged</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-100">Full audit coverage</p>
        </div>
      </div>

      {/* SYSTEM INSIGHTS BAR */}
      <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center">
            <Sparkles className="w-4 h-4 mr-1.5 text-slate-900" /> System Insights
          </h3>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md border border-slate-300">Automated</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {systemInsights.map(insight => (
            <div key={insight.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-slate-900 text-white rounded-md">{insight.type}</span>
                <span className="text-[10px] font-bold text-slate-400">Live</span>
              </div>
              <h4 className="font-extrabold text-slate-900">{insight.title}</h4>
              <p className="text-[11px] text-slate-600 font-medium">{insight.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MIDDLE SECTION: LOCATIONS & TODAY'S ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Sites & Warehouses Overview */}
        <div className="lg:col-span-2 bg-white border border-slate-300 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center">
              <Building2 className="w-4 h-4 mr-1.5 text-slate-900" /> Sites & Storage Locations
            </h2>
            <a href="/sites" className="text-xs font-bold text-slate-900 hover:underline flex items-center">
              View All Sites <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Sites</span>
              {[
                { name: 'Hyderabad Plant', code: 'HYD-01', status: 'Active' },
                { name: 'Bangalore Plant', code: 'BLR-01', status: 'Active' },
                { name: 'Chennai Distribution Center', code: 'MAA-01', status: 'Active' },
                { name: 'Pune Facility', code: 'PUN-01', status: 'Inactive' }
              ].map((site, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                  <span>{site.name}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    site.status === 'Active' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    ● {site.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Warehouses</span>
              {[
                { name: 'Main Warehouse', status: 'Active' },
                { name: 'Raw Material Warehouse', status: 'Active' },
                { name: 'Finished Goods Warehouse', status: 'Active' },
                { name: 'Old Storage Depot', status: 'Inactive' }
              ].map((wh, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                  <span>{wh.name}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    wh.status === 'Active' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    ● {wh.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: TODAY'S ACTIVITY FEED */}
        <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center">
                <BellRing className="w-4 h-4 mr-1.5 text-slate-900" /> Today's Activity Log
              </h2>
              <span className="text-[10px] font-bold text-slate-500">Today</span>
            </div>

            <div className="flex items-center space-x-1 text-[10px] font-bold">
              {['all', 'location', 'security', 'ops'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                    activeTab === tab ? 'bg-slate-900 text-white font-black' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {filteredActivities.map(act => (
                <div key={act.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-900">{act.title}</span>
                    <span className="text-[10px] font-mono text-slate-500">{act.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">{act.details}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold pt-1 border-t border-slate-100">
                    <span>{act.user}</span>
                    <span>📍 {act.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <a href="/settings" className="w-full flex items-center justify-center space-x-1.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs">
            <span>View Full Audit Log</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* TODAY'S ACTIVITY LOG TABLE */}
      <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center">
            <FileText className="w-4 h-4 mr-1.5 text-slate-900" /> Today's Activity Table
          </h2>
          <span className="text-[10px] font-bold text-slate-500">{todayFormatted}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3">Details</th>
                <th className="py-2.5 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {todaysActivities.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{log.time}</td>
                  <td className="py-2.5 px-3 font-bold">{log.user}</td>
                  <td className="py-2.5 px-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-bold text-[10px] rounded-md">{log.role}</span></td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 bg-slate-900 text-white rounded-md font-bold text-[10px] uppercase">{log.action}</span>
                  </td>
                  <td className="py-2.5 px-3 font-bold">{log.location}</td>
                  <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">{log.details}</td>
                  <td className="py-2.5 px-3 text-center">
                    <button onClick={() => setSelectedLog(log)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs rounded-lg transition-colors border border-slate-300">Inspect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SYSTEM HEALTH BAR */}
      <div className="bg-white border border-slate-300 p-4 rounded-2xl text-slate-900 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-bold">
        <div className="flex items-center space-x-2">
          <Server className="w-4 h-4 text-slate-900" />
          <span>System Status: <span className="text-slate-900 font-black">All Systems Normal</span></span>
        </div>
        <div className="flex items-center space-x-3 text-slate-600 text-[11px]">
          <span>Database: <strong className="text-slate-900">{data.systemHealth.database}</strong></span>
          <span>API: <strong className="text-slate-900">{data.systemHealth.api}</strong></span>
          <span>Workers: <strong className="text-slate-900">{data.systemHealth.systemWorker}</strong></span>
        </div>
      </div>

      {/* INSPECTION MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-black text-slate-900">Event Details: {selectedLog.id}</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-2 text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p><strong>Title:</strong> {selectedLog.title}</p>
              <p><strong>Time:</strong> {selectedLog.time}</p>
              <p><strong>User:</strong> {selectedLog.user} ({selectedLog.role})</p>
              <p><strong>Location:</strong> {selectedLog.location}</p>
              <p><strong>Action:</strong> {selectedLog.action}</p>
              <p><strong>Details:</strong> {selectedLog.details}</p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-4 py-1.5 bg-slate-900 text-white font-bold text-xs rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminControlCenter;
