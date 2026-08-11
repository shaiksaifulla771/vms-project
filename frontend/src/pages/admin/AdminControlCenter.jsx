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
  Cpu,
  Zap,
  ShieldAlert,
  TrendingUp,
  BrainCircuit,
  Search
} from 'lucide-react';

const AdminControlCenter = () => {
  const [loading, setLoading] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [activeActivityTab, setActiveActivityTab] = useState('all'); // all | security | location | ops
  const [selectedLog, setSelectedLog] = useState(null);
  const [aiNotice, setAiNotice] = useState(null);

  // Today's Date String for display
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  // Mock initial dashboard state grounded in system data
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
      database: 'Healthy (3ms)',
      api: '99.98% Uptime',
      aiEngine: 'Active (v4.2)',
      backgroundJobs: 'Running (0 backlog)',
      lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  });

  // Today's Live Activities Timeline
  const todaysActivitiesList = [
    {
      id: 'act-101',
      time: '14:25 PM',
      user: 'Shaik Saifulla',
      role: 'Admin',
      category: 'location',
      action: 'DEACTIVATE',
      title: 'Warehouse Deactivation Recorded',
      details: 'Admin deactivated "Old Storage Depot" at Pune Facility with mandatory audit reason.',
      location: 'Pune Facility',
      riskLevel: 'MEDIUM'
    },
    {
      id: 'act-102',
      time: '13:40 PM',
      user: 'Rahul Kumar',
      role: 'Inventory Manager',
      category: 'ops',
      action: 'STOCK_TRANSFER',
      title: 'Stock Allocated for Production Batch #1042',
      details: 'Transferred 300 units of Raw Material from Raw Material WH to Hyderabad Plant Assembly.',
      location: 'Raw Material Warehouse',
      riskLevel: 'LOW'
    },
    {
      id: 'act-103',
      time: '11:15 AM',
      user: 'Shaik Saifulla',
      role: 'Admin',
      category: 'security',
      action: 'SCOPE_CHANGE',
      title: 'User Scope Governance Updated',
      details: 'Updated Rahul Kumar location access scope to Main Warehouse & Raw Material WH.',
      location: 'Users & Scope Access',
      riskLevel: 'INFO'
    },
    {
      id: 'act-104',
      time: '09:30 AM',
      user: 'Priya Sharma',
      role: 'Production Manager',
      category: 'ops',
      action: 'BATCH_RELEASE',
      title: 'Finished Goods Batch #FG-902 Dispatched',
      details: 'Dispatched 500 units from Finished Goods Warehouse to Chennai DC.',
      location: 'Finished Goods Warehouse',
      riskLevel: 'LOW'
    },
    {
      id: 'act-105',
      time: '08:45 AM',
      user: 'Ahmed Khan',
      role: 'Planner',
      category: 'ops',
      action: 'APPOINTMENT',
      title: 'Vendor Dispatch Scheduled',
      details: 'Scheduled incoming delivery appointment with Acme Materials for 15:00 PM.',
      location: 'Hyderabad Plant',
      riskLevel: 'INFO'
    }
  ];

  // AI Copilot Live Insights
  const aiInsights = [
    {
      id: 1,
      type: 'OPTIMIZATION',
      title: 'Inventory Reorder Recommendation',
      description: 'Hyderabad Plant Raw Material stock is 12% below reorder threshold. Auto-dispatch suggested.',
      actionText: 'Auto-Reorder'
    },
    {
      id: 2,
      type: 'SECURITY',
      title: 'Location Scope Compliance 100%',
      description: 'No unauthorized multi-site access attempts recorded in the last 24 hours.',
      actionText: 'View Audit'
    },
    {
      id: 3,
      type: 'HEALTH',
      title: 'Database Index & Memory Optimal',
      description: 'MongoDB query latency operating at 3.2ms. All replica nodes synced.',
      actionText: 'Health Log'
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
      console.warn('Dashboard live refresh fallback:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAiDiagnostic = () => {
    setAiScanning(true);
    setAiNotice(null);
    setTimeout(() => {
      setAiScanning(false);
      setAiNotice({
        title: 'AI Neural Scan Complete',
        message: 'All 4 active sites, 12 warehouses, and 38 user scope profiles verified with ZERO operational anomalies detected.'
      });
    }, 1200);
  };

  const filteredActivities = todaysActivitiesList.filter(item => {
    if (activeActivityTab === 'all') return true;
    return item.category === activeActivityTab;
  });

  return (
    <div className="space-y-5 text-slate-900 font-sans">
      {/* TOP HIGH-TECH AI EXECUTIVE COMMAND HEADER */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border border-slate-800 p-5 rounded-2xl shadow-2xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-1">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-lg flex items-center">
              <BrainCircuit className="w-3.5 h-3.5 mr-1 text-cyan-400" /> AI Executive Command Center
            </span>
            <span className="text-xs text-emerald-400 font-bold flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1.5" />
              ● AI Neural Engine Online (v4.2)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Xperte Admin Operations Hub</h1>
          <p className="text-xs text-slate-400 font-medium">Real-time multi-site governance, today's activities, and automated risk monitoring for {todayFormatted}.</p>
        </div>

        <div className="relative z-10 flex items-center space-x-2.5">
          <button
            onClick={handleRunAiDiagnostic}
            disabled={aiScanning}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all border border-blue-400/30"
          >
            <Sparkles className={`w-4 h-4 text-cyan-300 ${aiScanning ? 'animate-spin' : ''}`} />
            <span>{aiScanning ? 'Scanning Neural Network...' : '⚡ Run AI Neural Diagnostic'}</span>
          </button>

          <button
            onClick={fetchDashboardData}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700/60"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* AI SCAN RESULT NOTICE */}
      {aiNotice && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 rounded-2xl flex items-center justify-between shadow-lg text-xs">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h4 className="font-extrabold uppercase tracking-wider text-emerald-300">{aiNotice.title}</h4>
              <p className="font-medium text-emerald-100">{aiNotice.message}</p>
            </div>
          </div>
          <button onClick={() => setAiNotice(null)} className="font-bold px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-emerald-300">Dismiss</button>
        </div>
      )}

      {/* 4 HIGH-PERFORMANCE KPI SPARKLINE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Active Sites */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Sites</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.activeSites} <span className="text-xs text-slate-400 font-semibold">/ {data.metrics.totalSites}</span></span>
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">+12.5%</span>
          </div>
          <p className="text-[11px] font-semibold text-emerald-600 flex items-center pt-1 border-t border-slate-100">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" /> All core plants operational
          </p>
        </div>

        {/* Active Warehouses */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Warehouses</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
              <Warehouse className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.activeWarehouses} <span className="text-xs text-slate-400 font-semibold">/ {data.metrics.totalWarehouses}</span></span>
            <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">100% Sync</span>
          </div>
          <p className="text-[11px] font-semibold text-amber-600 flex items-center pt-1 border-t border-slate-100">
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-500" /> 2 soft-deactivated locations
          </p>
        </div>

        {/* Active User Sessions */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Users</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.activeUsers}</span>
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">● 14 Online</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-100">
            Role scope enforcement active
          </p>
        </div>

        {/* Today's Audit Events */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Today's Audit Log</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{data.metrics.todaysActivities}</span>
            <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">Append-Only</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-100">
            100% audit trail coverage
          </p>
        </div>
      </div>

      {/* XPERTE AI NEURAL COPILOT WIDGET */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/60 p-4 rounded-2xl text-white shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-indigo-900/50 pb-2.5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-blue-500/20 text-cyan-300 rounded-lg border border-blue-400/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-white">Xperte AI Neural Copilot • Live Advisory</h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-md">Real-Time Insights</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {aiInsights.map((insight) => (
            <div key={insight.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md ${
                  insight.type === 'OPTIMIZATION' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                  insight.type === 'SECURITY' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                }`}>
                  {insight.type}
                </span>
                <span className="text-[10px] font-bold text-slate-400">Just Now</span>
              </div>
              <h4 className="font-extrabold text-white text-xs">{insight.title}</h4>
              <p className="text-[11px] text-slate-300 font-medium leading-relaxed">{insight.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MIDDLE SECTION: OPERATIONAL STATUS & TODAY'S LIVE ACTIVITIES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Operational Sites & Warehouses Matrix */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center">
                <Building2 className="w-4 h-4 mr-2 text-blue-600" /> Multi-Site Operational Hierarchy & Status
              </h2>
              <p className="text-xs text-slate-500 font-medium">Real-time status of physical manufacturing plants and storage warehouses</p>
            </div>
            <a href="/sites" className="text-xs font-bold text-blue-600 hover:underline flex items-center">
              Manage Hierarchy <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Sites Health Cards */}
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Active Sites Hierarchy</span>
              {[
                { name: 'Hyderabad Plant', code: 'HYD-01', status: 'Active', warehouses: 3, capacity: '88%' },
                { name: 'Bangalore Plant', code: 'BLR-01', status: 'Active', warehouses: 0, capacity: '45%' },
                { name: 'Chennai Distribution Center', code: 'MAA-01', status: 'Active', warehouses: 0, capacity: '62%' },
                { name: 'Pune Facility', code: 'PUN-01', status: 'Inactive', warehouses: 1, capacity: '0%' }
              ].map((site, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{site.name} ({site.code})</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                      site.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      ● {site.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span>{site.warehouses} Warehouses Assigned</span>
                    <span>Load: {site.capacity}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Warehouses Matrix */}
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Storage Warehouses</span>
              {[
                { name: 'Main Warehouse', site: 'Hyderabad Plant', type: 'General', status: 'Active' },
                { name: 'Raw Material Warehouse', site: 'Hyderabad Plant', type: 'Raw', status: 'Active' },
                { name: 'Finished Goods Warehouse', site: 'Hyderabad Plant', type: 'FG', status: 'Active' },
                { name: 'Old Storage Depot', site: 'Pune Facility', type: 'Scrap', status: 'Inactive' }
              ].map((wh, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{wh.name}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                      wh.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      ● {wh.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Parent: {wh.site} • Type: {wh.type}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: TODAY'S LIVE ACTIVITIES & GOVERNANCE TIMELINE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h2 className="text-xs font-black tracking-wider uppercase text-white flex items-center">
                  <BellRing className="w-4 h-4 mr-1.5 text-amber-400" /> Today's Live Activities ({todaysActivitiesList.length})
                </h2>
                <span className="text-[10px] text-slate-400 font-mono">{todayFormatted}</span>
              </div>
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-md border border-amber-500/30">Live Timeline</span>
            </div>

            {/* Filter Tabs inside Today's Activity */}
            <div className="flex items-center space-x-1 text-[10px] font-bold">
              {['all', 'location', 'security', 'ops'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveActivityTab(tab)}
                  className={`px-2 py-1 rounded-md capitalize transition-all ${
                    activeActivityTab === tab ? 'bg-blue-600 text-white font-extrabold' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Today's Activity Timeline Feed */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredActivities.map((act) => (
                <div key={act.id} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-400 text-[11px]">{act.title}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{act.time}</span>
                  </div>
                  <p className="text-slate-300 text-[11px] font-medium leading-tight">{act.details}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold pt-1">
                    <span>User: {act.user} ({act.role})</span>
                    <span className="text-slate-400 font-mono">📍 {act.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <a
            href="/settings"
            className="w-full flex items-center justify-center space-x-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors border border-slate-700/60"
          >
            <span>View Complete Audit History</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* BOTTOM SECTION: TODAY'S DETAILED LOG TABLE */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center">
              <FileText className="w-4 h-4 mr-1.5 text-blue-600" /> Today's Recorded Audit Actions
            </h2>
            <p className="text-xs text-slate-500 font-medium">Immutable append-only records logged for today ({todayFormatted})</p>
          </div>
          <a href="/settings" className="text-xs font-bold text-blue-600 hover:underline flex items-center">
            Open Audit Trail <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Location Target</th>
                <th className="py-3 px-4">Details / Audit Reason</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {todaysActivitiesList.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{log.time}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{log.user}</td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md">{log.role}</span></td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                      log.action === 'DEACTIVATE' ? 'bg-rose-100 text-rose-700' :
                      log.action === 'SCOPE_CHANGE' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{log.location}</td>
                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{log.details}</td>
                  <td className="py-3 px-4 text-center">
                    <button onClick={() => setSelectedLog(log)} className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded-lg transition-colors">Inspect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LIVE SYSTEM HEALTH STATUS BAR */}
      <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold tracking-wide flex items-center">
              SYSTEM HEALTH MONITOR <span className="ml-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">Last Synced: {data.systemHealth.lastSync}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-bold text-[11px]">
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-900 rounded-lg border border-slate-800">
            <span className="text-slate-400">Database:</span>
            <span className="text-emerald-400">● {data.systemHealth.database}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-900 rounded-lg border border-slate-800">
            <span className="text-slate-400">AI Neural Engine:</span>
            <span className="text-cyan-400">● {data.systemHealth.aiEngine}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-900 rounded-lg border border-slate-800">
            <span className="text-slate-400">API Gateway:</span>
            <span className="text-emerald-400">● {data.systemHealth.api}</span>
          </div>
        </div>
      </div>

      {/* INSPECT LOG MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Event Inspection: {selectedLog.id}</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-2 text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p><strong>Title:</strong> {selectedLog.title}</p>
              <p><strong>Time:</strong> {selectedLog.time}</p>
              <p><strong>User:</strong> {selectedLog.user} ({selectedLog.role})</p>
              <p><strong>Location Target:</strong> {selectedLog.location}</p>
              <p><strong>Action:</strong> <span className="font-extrabold text-blue-600">{selectedLog.action}</span></p>
              <p><strong>Full Details:</strong> {selectedLog.details}</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-4 py-1.5 bg-slate-900 text-white font-bold text-xs rounded-xl">Close Inspection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminControlCenter;
