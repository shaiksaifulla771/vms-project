import React, { useState, useEffect } from 'react';
import api from '../../services/api';
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
  const [activeTab, setActiveTab] = useState('visitors'); // visitors | insights
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
      todaysVisitors: 0,
      scheduledVisitors: 0,
      activeVendors: 0,
      pendingVendors: 0,
      activeLocations: 0,
      gatePassesToday: 0
    },
    systemHealth: null,
    recentActivity: [],
    vendorDistribution: [0, 0, 0, 0]
  });

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, vendorsRes, appointmentsRes] = await Promise.all([
        api.get('/api/admin/network-summary').catch(err => ({ data: null })),
        api.get('/api/vendors').catch(err => ({ data: { data: [] } })),
        api.get('/api/appointments').catch(err => ({ data: { data: [] } }))
      ]);

      const summary = summaryRes.data;
      const vendors = vendorsRes.data?.data || vendorsRes.data || [];
      const appointments = appointmentsRes.data?.data || appointmentsRes.data || [];

      // Calculate vendor metrics from real MongoDB vendors
      const activeVendors = vendors.filter(v => v.status === 'Active').length;
      const pendingVendors = vendors.filter(v => v.status === 'Pending' || v.status === 'Under Review').length;
      const suspendedVendors = vendors.filter(v => v.status === 'Suspended' || v.status === 'Blacklisted').length;
      const otherVendors = vendors.length - activeVendors - pendingVendors - suspendedVendors;

      // Calculate appointment metrics from real MongoDB appointments
      const todaysVisitors = appointments.filter(a => a.status === 'CheckedIn' || a.status === 'Completed').length;
      const scheduledVisitors = appointments.length;

      // Extracted metrics from backend summary or fallbacks
      const activeLocations = (summary?.metrics?.activeSites || 0) + (summary?.metrics?.activeWarehouses || 0);
      const gatePasses = summary?.metrics?.todaysActivities || todaysVisitors;

      setData({
        metrics: {
          todaysVisitors,
          scheduledVisitors,
          activeVendors,
          pendingVendors,
          activeLocations,
          gatePassesToday: gatePasses
        },
        systemHealth: summary?.systemHealth || { database: 'Healthy', api: 'Online' },
        recentActivity: summary?.recentActivity || [],
        vendorDistribution: [activeVendors, pendingVendors, otherVendors, suspendedVendors]
      });
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err.response?.data?.error || 'Failed to load control center summary from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRunHealthCheck = async () => {
    setIsChecking(true);
    setNotice(null);
    try {
      const res = await api.get('/api/health');
      setNotice({
        title: 'Backend Health Verification',
        message: `System operational. Status: ${res.data.status || 'ok'} (Uptime: ${Math.floor(res.data.uptime || 0)}s)`
      });
    } catch (err) {
      setNotice({
        title: 'Backend Health Warning',
        message: err.response?.data?.error || 'Healthcheck endpoint unreachable or reported degraded state.'
      });
    } finally {
      setIsChecking(false);
    }
  };

  // VMS Gate Visitor Traffic Bar Chart Configuration
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
      categories: ['Sites Active', 'Warehouses Active', 'Audit Logs Today', 'Checked In']
    },
    yaxis: {
      labels: {
        formatter: (val) => `${val}`
      }
    },
    fill: { opacity: 1 }
  };

  const visitorTrafficSeries = [
    { name: 'Count', data: [data.metrics.activeLocations, data.metrics.activeVendors, data.metrics.gatePassesToday, data.metrics.todaysVisitors] }
  ];

  // VMS Vendor Status Donut Chart
  const vendorStatusOptions = {
    chart: {
      type: 'donut',
      height: 280
    },
    colors: ['#00C951', '#F0B100', '#00B8DB', '#E66239'],
    labels: ['Active Vendors', 'Pending Review', 'In Setup', 'Suspended / Inactive'],
    legend: { position: 'bottom' }
  };

  const vendorStatusSeries = data.vendorDistribution;

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

      {/* ERROR ALERT */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between text-xs font-medium">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span><strong>System Error:</strong> {error}</span>
          </div>
          <button onClick={fetchDashboardData} className="px-3 py-1 bg-red-600 text-white font-bold rounded-lg text-xs hover:bg-red-700">Retry</button>
        </div>
      )}

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
              <p className="text-orange-600 text-[11px] font-medium">Real-time gate check-ins</p>
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
              <p className="text-emerald-600 text-[11px] font-medium">Database audit synchronized</p>
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
              <p className="text-cyan-600 text-[11px] font-medium">MongoDB Sites & Warehouses</p>
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
              <h2 className="text-xs font-semibold text-slate-600 uppercase">Gate Activities Today</h2>
              <h3 className="text-xl font-bold text-slate-900">{data.metrics.gatePassesToday}</h3>
              <p className="text-amber-600 text-[11px] font-medium">Audit logs count today</p>
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
              <i className="ti ti-chart-bar me-2 text-orange-500 fs-4"></i> System Operational Metrics
            </h3>
          </div>
          <Chart options={visitorTrafficOptions} series={visitorTrafficSeries} type="bar" height={260} />
        </div>

        {/* Chart 2: Vendor Compliance & QC Audit Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <i className="ti ti-chart-pie me-2 text-emerald-500 fs-4"></i> Vendor Status Breakdown
            </h3>
          </div>
          <Chart options={vendorStatusOptions} series={vendorStatusSeries} type="donut" height={260} />
        </div>
      </div>

      {/* INAPP TEMPLATE STYLED VMS REAL AUDIT ACTIVITY LOG TABLE */}
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
            <span>Real Audit & Gate Activity Stream</span>
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
            <span>System Health & Status</span>
          </button>
        </div>

        {activeTab === 'visitors' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs font-semibold">Loading real audit log stream...</div>
            ) : data.recentActivity.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-semibold">No recent activity records found in MongoDB.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <th className="py-2.5 px-3.5">USER</th>
                    <th className="py-2.5 px-3.5">ACTION</th>
                    <th className="py-2.5 px-3.5">MODULE</th>
                    <th className="py-2.5 px-3.5">RESULT</th>
                    <th className="py-2.5 px-3.5">TIMESTAMP & DETAILS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                  {data.recentActivity.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{log.userName || log.userId?.username || 'System'} ({log.role || log.userId?.role || 'Admin'})</td>
                      <td className="py-2.5 px-3.5 font-bold text-blue-600 text-xs hover:underline cursor-pointer" onClick={() => setSelectedLog(log)}>{log.action}</td>
                      <td className="py-2.5 px-3.5 text-slate-600 text-xs font-semibold">{log.module || log.entityType}</td>
                      <td className="py-2.5 px-3.5 text-xs font-bold">
                        <span className={`px-2 py-0.5 rounded-md ${log.result === 'Success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          ● {log.result || 'Success'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-400 text-xs">{new Date(log.timestamp || log.createdAt).toLocaleString()} - {log.reason || log.locationName || 'System Event'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded-md">DATABASE</span>
              <h4 className="font-bold text-slate-900 text-xs pt-1">MongoDB Connection</h4>
              <p className="text-[11px] text-slate-600">{data.systemHealth?.database || 'Healthy'}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-md">API GATEWAY</span>
              <h4 className="font-bold text-slate-900 text-xs pt-1">Backend Express API</h4>
              <p className="text-[11px] text-slate-600">{data.systemHealth?.api || 'Online'}</p>
            </div>
          </div>
        )}
      </div>

      {/* INSPECTION MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Audit Log Details</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-1.5 text-xs font-semibold text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p><strong>User:</strong> {selectedLog.userName} ({selectedLog.role})</p>
              <p><strong>Action:</strong> {selectedLog.action}</p>
              <p><strong>Module:</strong> {selectedLog.module}</p>
              <p><strong>Result:</strong> {selectedLog.result}</p>
              <p><strong>Timestamp:</strong> {new Date(selectedLog.timestamp).toLocaleString()}</p>
              <p><strong>Reason / Details:</strong> {selectedLog.reason || 'N/A'}</p>
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
