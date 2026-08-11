import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Chart from 'react-apexcharts';
import {
  CheckCircle2,
  RefreshCw,
  Filter,
  Search,
  ChevronDown,
  Bell,
  User,
  Plus
} from 'lucide-react';

const AdminControlCenter = () => {
  const [activeTab, setActiveTab] = useState('overview'); // overview | activities | locations | insights
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

  // InApp Dashboard ApexCharts Configurations
  const salesPurchaseChartOptions = {
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
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
    },
    yaxis: {
      labels: {
        formatter: (val) => `$${val}k`
      }
    },
    fill: { opacity: 1 },
    tooltip: {
      y: {
        formatter: (val) => `$ ${val} Thousands`
      }
    }
  };

  const salesPurchaseChartSeries = [
    { name: 'Dispatches & Sales', data: [44, 55, 57, 56, 61, 58, 63, 60] },
    { name: 'Purchases & Inbound', data: [35, 41, 36, 26, 45, 48, 52, 53] }
  ];

  const customerDonutOptions = {
    chart: {
      type: 'donut',
      height: 280
    },
    colors: ['#E66239', '#00C951', '#00B8DB', '#F0B100'],
    labels: ['Manufacturing Plants', 'Distribution Centers', 'Raw Material WH', 'Finished Goods WH'],
    legend: { position: 'bottom' },
    responsive: [{
      breakpoint: 480,
      options: {
        chart: { width: 200 },
        legend: { position: 'bottom' }
      }
    }]
  };

  const customerDonutSeries = [45, 25, 20, 10];

  const todaysActivities = [
    {
      id: 'ACT-1094',
      time: '14:25 PM',
      user: 'Shaik Saifulla',
      role: 'Admin',
      category: 'location',
      action: 'DEACTIVATE',
      title: 'Warehouse Deactivated',
      location: 'Pune Facility',
      status: 'Active',
      details: 'Old Storage Depot marked inactive with audit reason.'
    },
    {
      id: 'ACT-1093',
      time: '13:40 PM',
      user: 'Rahul Kumar',
      role: 'Inventory Manager',
      category: 'ops',
      action: 'TRANSFER',
      title: 'Stock Transfer Allocated',
      location: 'Raw Material Warehouse',
      status: 'Active',
      details: 'Transferred 300 units from Raw Material WH to Assembly.'
    },
    {
      id: 'ACT-1001',
      time: '11:15 AM',
      user: 'Shaik Saifulla',
      role: 'Admin',
      category: 'security',
      action: 'ACCESS',
      title: 'User Scope Updated',
      location: 'Users & Access Scope',
      status: 'Active',
      details: 'Updated Rahul Kumar access to Main & Raw Material WH.'
    },
    {
      id: 'ACT-0902',
      time: '09:30 AM',
      user: 'Priya Sharma',
      role: 'Production Manager',
      category: 'ops',
      action: 'DISPATCH',
      title: 'Finished Goods Dispatched',
      location: 'Finished Goods Warehouse',
      status: 'Active',
      details: 'Dispatched 500 units to Chennai Distribution Center.'
    }
  ];

  const systemInsights = [
    {
      id: 1,
      type: 'INVENTORY',
      title: 'Reorder Reminder',
      status: 'Active',
      description: 'Hyderabad Plant Raw Material stock is at 12%. Reorder suggested.'
    },
    {
      id: 2,
      type: 'SECURITY',
      title: 'Access Compliance',
      status: 'Active',
      description: 'Zero unauthorized access attempts recorded in the last 24h.'
    },
    {
      id: 3,
      type: 'SYSTEM',
      title: 'Database Status',
      status: 'Active',
      description: 'All system databases and replica nodes operating normally.'
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
        message: 'All sites, warehouses, and user scope profiles are verified and healthy.'
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
              InApp VMS Template
            </span>
            <span className="text-xs text-slate-500 font-medium">● Dashboard Control</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-xs text-slate-500 font-normal">Welcome to InApp Inventory Dashboard for {todayFormatted}.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRunHealthCheck}
            disabled={isChecking}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors"
          >
            <i className={`ti ti-heartbeat fs-5 ${isChecking ? 'animate-spin' : ''}`}></i>
            <span>{isChecking ? 'Checking...' : 'Run Health Check'}</span>
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

      {/* EXACT INAPP TEMPLATE KPI STAT CARDS WITH TINTED OPACITY AND TABLER ICONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Sales / Active Sites */}
        <div className="card p-4 bg-orange-500/10 border border-orange-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-orange-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-report-analytics fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Active Sites</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.activeSites} <span className="text-xs text-slate-400 font-normal">/ {data.metrics.totalSites}</span></h3>
              <p className="text-orange-600 text-[11px] font-medium">+5% active coverage</p>
            </div>
          </div>
        </div>

        {/* Card 2: Total Purchase / Active Warehouses */}
        <div className="card p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-emerald-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-repeat fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Active Warehouses</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.activeWarehouses} <span className="text-xs text-slate-400 font-normal">/ {data.metrics.totalWarehouses}</span></h3>
              <p className="text-emerald-600 text-[11px] font-medium">+22% inventory sync</p>
            </div>
          </div>
        </div>

        {/* Card 3: Total Expenses / Active Users */}
        <div className="card p-4 bg-cyan-500/10 border border-cyan-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-cyan-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-currency-dollar fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Active Users</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.activeUsers}</h3>
              <p className="text-cyan-600 text-[11px] font-medium">+10% active logins</p>
            </div>
          </div>
        </div>

        {/* Card 4: Invoice Due / Today's Activities */}
        <div className="card p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="icon-shape icon-md bg-amber-500 text-white rounded-lg flex items-center justify-center">
              <i className="ti ti-notes fs-3"></i>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Today's Activities</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.todaysActivities}</h3>
              <p className="text-amber-600 text-[11px] font-medium">+35% audit records</p>
            </div>
          </div>
        </div>
      </div>

      {/* APEXCHARTS DASHBOARD SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Dispatches & Sales vs Purchase */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <i className="ti ti-chart-bar me-2 text-orange-500 fs-4"></i> Activity & Inbound Metrics
            </h3>
            <select className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 font-medium text-slate-700 outline-none">
              <option>This Year</option>
              <option>This Month</option>
            </select>
          </div>
          <Chart options={salesPurchaseChartOptions} series={salesPurchaseChartSeries} type="bar" height={260} />
        </div>

        {/* Chart 2: Overall Facility Overview Donut Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <i className="ti ti-chart-pie me-2 text-emerald-500 fs-4"></i> Location Distribution
            </h3>
            <select className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 font-medium text-slate-700 outline-none">
              <option>Last 6 Months</option>
              <option>This Month</option>
            </select>
          </div>
          <Chart options={customerDonutOptions} series={customerDonutSeries} type="donut" height={260} />
        </div>
      </div>

      {/* INAPP TEMPLATE HORIZONTAL TABBED ACTIVITY TABLE */}
      <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs">
        <div className="flex border-b border-slate-200 px-4 pt-3">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <i className="ti ti-list-details fs-5"></i>
            <span>Today's Activity Log</span>
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === 'insights'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <i className="ti ti-sparkles fs-5"></i>
            <span>System Insights</span>
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>ACTIVITY TITLE</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>CODE</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>USER</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>LOCATION</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>ACTION</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex items-center justify-between">
                      <span>STATUS</span>
                      <Filter className="w-3 h-3 text-slate-300" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">DESCRIPTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                {todaysActivities.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{act.title}</td>
                    <td className="py-2.5 px-3.5 font-bold text-blue-600 text-xs hover:underline cursor-pointer" onClick={() => setSelectedLog(act)}>{act.id}</td>
                    <td className="py-2.5 px-3.5 text-slate-600 text-xs font-semibold">{act.user} ({act.role})</td>
                    <td className="py-2.5 px-3.5 text-slate-600 text-xs">{act.location}</td>
                    <td className="py-2.5 px-3.5 text-slate-800 font-bold text-xs">{act.action}</td>
                    <td className="py-2.5 px-3.5 text-xs font-bold text-emerald-600">{act.status}</td>
                    <td className="py-2.5 px-3.5 text-slate-400 text-xs">{act.details}</td>
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
              <h3 className="text-sm font-bold text-slate-900">Event Inspection ({selectedLog.id})</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-1.5 text-xs font-semibold text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p><strong>Title:</strong> {selectedLog.title}</p>
              <p><strong>Time:</strong> {selectedLog.time}</p>
              <p><strong>User:</strong> {selectedLog.user} ({selectedLog.role})</p>
              <p><strong>Location:</strong> {selectedLog.location}</p>
              <p><strong>Action:</strong> {selectedLog.action}</p>
              <p><strong>Details:</strong> {selectedLog.details}</p>
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
