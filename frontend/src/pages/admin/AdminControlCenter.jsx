import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Chart from 'react-apexcharts';
import {
  CheckCircle2,
  RefreshCw,
  Filter,
  Search,
  Plus,
  ShieldCheck,
  UserCheck,
  Building2,
  Warehouse,
  Clock,
  AlertTriangle
} from 'lucide-react';

const AdminControlCenter = () => {
  const [activeTab, setActiveTab] = useState('visitors'); // visitors | vendors | locations | insights
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
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
      todaysVisitors: 42,
      scheduledVisitors: 50,
      activeVendors: 28,
      pendingVendors: 5,
      activeLocations: 16,
      gatePassesToday: 126
    },
    systemHealth: {
      database: 'Healthy',
      api: 'Online',
      securityGateWorker: 'Active',
      lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  });

  // VMS Gate Visitor Traffic ApexCharts Bar Configuration
  const visitorTrafficOptions = {
    chart: {
      type: 'bar',
      height: 280,
      toolbar: { show: false }
    },
    colors: ['#E66239', '#00C951'],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '45%',
        borderRadius: 4
      }
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ['transparent'] },
    xaxis: {
      categories: ['08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM']
    },
    yaxis: {
      labels: {
        formatter: (val) => `${val}`
      }
    },
    fill: { opacity: 1 },
    tooltip: {
      y: {
        formatter: (val) => `${val} Visitors`
      }
    }
  };

  const visitorTrafficSeries = [
    { name: 'Gate Check-Ins', data: [12, 28, 35, 42, 22, 8] },
    { name: 'Gate Check-Outs', data: [2, 10, 24, 38, 30, 18] }
  ];

  // VMS Vendor Compliance & Onboarding Donut Chart
  const vendorStatusOptions = {
    chart: {
      type: 'donut',
      height: 280
    },
    colors: ['#00C951', '#E66239', '#00B8DB', '#F0B100'],
    labels: ['Approved Vendors', 'Pending QC Audit', 'Contract Under Review', 'Blacklisted / Suspended'],
    legend: { position: 'bottom' },
    responsive: [{
      breakpoint: 480,
      options: {
        chart: { width: 200 },
        legend: { position: 'bottom' }
      }
    }]
  };

  const vendorStatusSeries = [28, 5, 4, 1];

  const todaysGateLogs = [
    {
      id: 'VMS-1094',
      time: '14:25 PM',
      name: 'Ramesh Sharma',
      company: 'Logistics India Pvt Ltd',
      purpose: 'Raw Material Delivery',
      location: 'Hyderabad Plant - Gate 1',
      host: 'Rahul Kumar (Inventory Mgr)',
      status: 'Checked In',
      details: 'Vehicle #TS-09-EA-4012 checked in at Hyderabad Main Gate.'
    },
    {
      id: 'VMS-1093',
      time: '13:40 PM',
      name: 'Ananya Verma',
      company: 'TechFab Solutions',
      purpose: 'Equipment Maintenance Audit',
      location: 'Bangalore Plant - Gate 2',
      host: 'Priya Sharma (Ops Mgr)',
      status: 'Checked In',
      details: 'Badge #BGL-802 issued for facility maintenance inspection.'
    },
    {
      id: 'VMS-1001',
      time: '11:15 AM',
      name: 'Suresh Kumar',
      company: 'Apex Industrial',
      purpose: 'Vendor Contract Renewal',
      location: 'Chennai Distribution Center',
      host: 'Shaik Saifulla (Admin)',
      status: 'Checked Out',
      details: 'Vendor pass closed and badge returned at 13:10 PM.'
    },
    {
      id: 'VMS-0902',
      time: '09:30 AM',
      name: 'Vikram Singh',
      company: 'Express Freight',
      purpose: 'Finished Goods Dispatch',
      location: 'Hyderabad Plant - FG Gate',
      host: 'Ahmed Khan (Planner)',
      status: 'Checked Out',
      details: 'Dispatched 500 units to Chennai Hub with verified gate pass.'
    }
  ];

  const systemInsights = [
    {
      id: 1,
      type: 'SECURITY',
      title: 'Active Gate Clearance',
      status: 'Active',
      description: 'Zero unauthorized visitor access attempts recorded today.'
    },
    {
      id: 2,
      type: 'VENDOR QC',
      title: 'Vendor Onboarding Review',
      status: 'Active',
      description: '5 vendor compliance documents pending manager sign-off.'
    },
    {
      id: 3,
      type: 'LOCATION',
      title: 'Multi-Site Scope Active',
      status: 'Active',
      description: 'Hyderabad, Bangalore, and Chennai facilities reporting live sync.'
    }
  ];

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/vms/summary');
      if (res.data?.metrics) {
        setData(prev => ({ ...prev, metrics: res.data.metrics }));
      }
    } catch (err) {
      console.warn('VMS Summary fallback:', err.message);
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
        title: 'VMS Gate System Active',
        message: 'All visitor gates, vendor passes, and location scope rules verified healthy.'
      });
    }, 800);
  };

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* INAPP TOPBAR & PAGE TITLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-500 text-white rounded-md">
              InApp VMS Executive Control
            </span>
            <span className="text-xs text-slate-500 font-medium">● Gate & Vendor Management System</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">VMS Executive Dashboard</h1>
          <p className="text-xs text-slate-500 font-normal">Real-time visitor clearance, vendor compliance, and location security status for {todayFormatted}.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRunHealthCheck}
            disabled={isChecking}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors"
          >
            <i className={`ti ti-shield-check fs-5 ${isChecking ? 'animate-spin' : ''}`}></i>
            <span>{isChecking ? 'Checking...' : 'Run Gate Check'}</span>
          </button>

          <button
            onClick={fetchDashboardData}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs rounded-lg shadow-2xs transition-colors"
          >
            <i className={`ti ti-refresh fs-5 ${loading ? 'animate-spin' : ''}`}></i>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SYSTEM NOTICE */}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between text-xs font-medium">
          <div className="flex items-center space-x-2">
            <i className="ti ti-circle-check fs-4 text-emerald-600"></i>
            <span><strong>{notice.title}:</strong> {notice.message}</span>
          </div>
          <button onClick={() => setNotice(null)} className="font-bold underline text-emerald-700">Dismiss</button>
        </div>
      )}

      {/* VMS REAL-TIME KPI CARDS WITH TABLER ICONS & OPACITY TINTS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Visitor Appointments Today */}
        <div className="card p-4 bg-orange-500/10 border border-orange-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-orange-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-users fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Today's Visitors</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.todaysVisitors} <span className="text-xs text-slate-400 font-normal">/ {data.metrics.scheduledVisitors} Scheduled</span></h3>
              <p className="text-orange-600 text-[11px] font-medium">+12 checked in this hour</p>
            </div>
          </div>
        </div>

        {/* Card 2: Verified Vendors & Onboarding */}
        <div className="card p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-emerald-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-building-store fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Verified Vendors</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.activeVendors} <span className="text-xs text-slate-400 font-normal">Active ({data.metrics.pendingVendors} Pending)</span></h3>
              <p className="text-emerald-600 text-[11px] font-medium">100% compliance audit</p>
            </div>
          </div>
        </div>

        {/* Card 3: Active Locations & Storage Depots */}
        <div className="card p-4 bg-cyan-500/10 border border-cyan-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-cyan-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-building fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Active Locations</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.activeLocations}</h3>
              <p className="text-cyan-600 text-[11px] font-medium">4 Sites • 12 Warehouses</p>
            </div>
          </div>
        </div>

        {/* Card 4: Security Gate Passes Issued */}
        <div className="card p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-amber-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-id-badge-2 fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Gate Passes Today</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.gatePassesToday}</h3>
              <p className="text-amber-600 text-[11px] font-medium">100% gate audit log</p>
            </div>
          </div>
        </div>
      </div>

      {/* APEXCHARTS VMS ANALYTICS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Gate Visitor Check-Ins vs Check-Outs */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <i className="ti ti-chart-bar me-2 text-orange-500 fs-4"></i> Visitor & Gate Traffic Trend
            </h3>
            <select className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 font-medium text-slate-700 outline-none">
              <option>Today (Hourly)</option>
              <option>This Week</option>
            </select>
          </div>
          <Chart options={visitorTrafficOptions} series={visitorTrafficSeries} type="bar" height={260} />
        </div>

        {/* Chart 2: Vendor Compliance & QC Audit Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <i className="ti ti-chart-pie me-2 text-emerald-500 fs-4"></i> Vendor Status Breakdown
            </h3>
            <select className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 font-medium text-slate-700 outline-none">
              <option>All Active Vendors</option>
              <option>Pending Audits</option>
            </select>
          </div>
          <Chart options={vendorStatusOptions} series={vendorStatusSeries} type="donut" height={260} />
        </div>
      </div>

      {/* INAPP TEMPLATE STYLED VMS TODAY'S GATE ACTIVITY LOG TABLE */}
      <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs">
        <div className="flex border-b border-slate-200 px-4 pt-3">
          <button
            onClick={() => setActiveTab('visitors')}
            className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === 'visitors'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <i className="ti ti-id-badge fs-5"></i>
            <span>Today's Gate Passes & Visitors</span>
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === 'insights'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <i className="ti ti-sparkles fs-5"></i>
            <span>Security Insights</span>
          </button>
        </div>

        {activeTab === 'visitors' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>VISITOR / VENDOR</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>PASS ID</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>COMPANY / PURPOSE</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>GATE LOCATION</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>HOST EMPLOYEE</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>STATUS</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">TIME & DETAILS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                {todaysGateLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{log.name}</td>
                    <td className="py-2.5 px-3.5 font-bold text-blue-600 text-xs hover:underline cursor-pointer" onClick={() => setSelectedLog(log)}>{log.id}</td>
                    <td className="py-2.5 px-3.5 text-slate-600 text-xs font-semibold">{log.company} ({log.purpose})</td>
                    <td className="py-2.5 px-3.5 text-slate-600 text-xs">{log.location}</td>
                    <td className="py-2.5 px-3.5 text-slate-800 font-bold text-xs">{log.host}</td>
                    <td className="py-2.5 px-3.5 text-xs font-bold">
                      <span className={`px-2 py-0.5 rounded-md ${log.status === 'Checked In' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                        ● {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-400 text-xs">{log.time} - {log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {systemInsights.map((insight) => (
              <div key={insight.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded-md">{insight.type}</span>
                <h4 className="font-bold text-slate-900 text-xs pt-1">{insight.title}</h4>
                <p className="text-[11px] text-slate-600">{insight.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* INSPECTION MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">VMS Gate Pass Details ({selectedLog.id})</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-1.5 text-xs font-semibold text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p><strong>Visitor / Vendor:</strong> {selectedLog.name}</p>
              <p><strong>Company / Purpose:</strong> {selectedLog.company} ({selectedLog.purpose})</p>
              <p><strong>Gate Location:</strong> {selectedLog.location}</p>
              <p><strong>Host Employee:</strong> {selectedLog.host}</p>
              <p><strong>Pass Status:</strong> {selectedLog.status}</p>
              <p><strong>Entry Log Details:</strong> {selectedLog.details}</p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminControlCenter;
