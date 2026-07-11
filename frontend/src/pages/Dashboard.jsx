import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Boxes, ClipboardList, ShoppingBag, Sparkles, RefreshCw } from 'lucide-react';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const fetchDashboardData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    } else {
      setSyncing(true);
    }
    setError(null);
    try {
      const res = await api.get('/api/reports/summary');
      if (res.data && res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      if (!silent) {
        setError('Connection failure: Could not load ERP dashboard statistics.');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    // Initial load
    fetchDashboardData(false);

    // Dynamic Background Auto-Polling (Poll every 5 seconds for live data sync)
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        <p className="text-sm font-semibold text-slate-500">Syncing live ERP ledger records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center max-w-lg mx-auto mt-20">
        <p className="text-red-700 font-semibold mb-2">{error}</p>
        <button
          onClick={() => fetchDashboardData(false)}
          className="mt-2 text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
        >
          Try Reconnecting
        </button>
      </div>
    );
  }

  // Guard to prevent null-reference crashes during state transition
  if (!data || !data.summary) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        <p className="text-sm font-semibold text-slate-500">Preparing dashboards...</p>
      </div>
    );
  }

  const { summary } = data;

  // Calculate percentages for charts
  const rawPercentage = summary.totalMaterials > 0 ? (summary.rawMaterials / summary.totalMaterials) * 100 : 0;
  const finishedPercentage = summary.totalMaterials > 0 ? (summary.finishedGoods / summary.totalMaterials) * 100 : 0;
  const qcPassRate = summary.totalQCInspections > 0 ? (summary.passedQCInspections / summary.totalQCInspections) * 100 : 100;

  return (
    <div className="space-y-6">
      {/* Real-time sync indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {syncing ? 'Synchronizing live ledgers...' : 'Live Sync Active (Auto 5s)'}
          </span>
        </div>
        
        <button 
          onClick={() => fetchDashboardData(true)} 
          disabled={syncing}
          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
          title="Force Manual Sync"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Upper KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1 */}
        <Card className="hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out cursor-pointer">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Warehouse Stock</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {summary.totalStockQuantity.toLocaleString()} units
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Across <span className="text-blue-600 font-semibold">{summary.totalMaterials} materials</span> profiles
              </p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 p-4 rounded-2xl shadow-sm border border-blue-100/50">
              <Boxes className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2 */}
        <Card className="hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out cursor-pointer">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active BOM Configurations</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{summary.totalBOMs} Recipes</h3>
              <p className="text-xs text-slate-500 font-medium">
                For <span className="font-semibold text-slate-700">{summary.finishedGoods} finished product lots</span>
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 text-emerald-600 p-4 rounded-2xl shadow-sm border border-emerald-100/50">
              <ClipboardList className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3 */}
        <Card className="hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out cursor-pointer">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Purchase Orders</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{summary.pendingPOs} POs</h3>
              <p className="text-xs text-slate-500 font-medium">
                Totaling <span className="font-semibold text-slate-700">${summary.pendingProcurementSpend.toLocaleString()}</span>
              </p>
            </div>
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 text-amber-600 p-4 rounded-2xl shadow-sm border border-amber-100/50">
              <ShoppingBag className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category distribution (Bar Chart with CSS height bug resolved) */}
        <Card>
          <CardHeader>
            <CardTitle>Master Materials Registry</CardTitle>
            <CardDescription>Sector categorization ratios of stock definitions</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="w-full h-64 bg-slate-50 rounded-xl p-4 flex flex-col justify-between">
              <div className="h-44 flex items-end justify-around px-6 pb-2 border-b border-slate-200">
                {[
                  { 
                    label: 'Raw Materials', 
                    value: rawPercentage, 
                    count: summary.rawMaterials, 
                    gradient: 'linear-gradient(to top, #2563eb, #60a5fa)',
                    color: '#3b82f6'
                  },
                  { 
                    label: 'Finished Goods', 
                    value: finishedPercentage, 
                    count: summary.finishedGoods, 
                    gradient: 'linear-gradient(to top, #059669, #34d399)',
                    color: '#10b981'
                  }
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center space-y-2 group relative w-1/3">
                    <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-2 py-1 rounded shadow pointer-events-none whitespace-nowrap z-20 transition-opacity font-semibold">
                      {item.count} profiles ({item.value.toFixed(1)}%)
                    </div>
                    <div
                      className="w-16 rounded-t-lg transition-all duration-500 hover:scale-105 shadow-md"
                      style={{
                        height: `${Math.max((item.value / 100) * 120, 12)}px`,
                        background: item.gradient
                      }}
                    ></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center space-x-4 pt-2 text-[10px] text-slate-500 font-semibold">
                <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 bg-blue-500 rounded"></span><span>Raw Components ({summary.rawMaterials})</span></span>
                <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded"></span><span>Finished Goods ({summary.finishedGoods})</span></span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quality Record checks (SVG Donut Chart with clean, solid progress ring math) */}
        <Card>
          <CardHeader>
            <CardTitle>QC Quality Control Check Rates</CardTitle>
            <CardDescription>Inspection pass vs fail ratios for finished batches</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="w-full h-64 bg-slate-50 rounded-xl p-4 flex items-center justify-around">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="#e2e8f0" strokeWidth="8" />
                  
                  {/* Quality Pass Progress Ring */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke={qcPassRate > 75 ? '#10b981' : '#ef4444'} // Green if high, red if low
                    strokeWidth="8"
                    strokeDasharray="238.7"
                    strokeDashoffset={238.7 * (1 - (qcPassRate / 100))}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>

                <div className="absolute text-center">
                  <p className="text-2xl font-black text-slate-800">{qcPassRate.toFixed(0)}%</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Batch Pass Rate</p>
                </div>
              </div>

              {/* Legends */}
              <div className="space-y-3 text-xs font-semibold text-slate-600">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                  <div>
                    <p className="text-slate-800 font-bold">Passed ({summary.passedQCInspections})</p>
                    <p className="text-[10px] text-slate-400">Stocked in warehouse</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
                  <div>
                    <p className="text-slate-800 font-bold">Failed ({summary.failedQCInspections})</p>
                    <p className="text-[10px] text-slate-400">Sent to rework check</p>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-bold pt-2 border-t border-slate-200">
                  Total Checked Lots: {summary.totalQCInspections}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI banner */}
      <Card className="bg-slate-900 border-none text-white overflow-hidden relative shadow-lg">
        <CardContent className="p-6 flex items-start space-x-4 relative z-10">
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 p-3 rounded-xl">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white mb-1">Operational Data Synchronized</h4>
            <p className="text-slate-400 text-xs leading-relaxed max-w-2xl">
              MRP algorithms calculate real-time availability ratios. Draft procurement POs, schedule production tickets, run QC inspections, and compile downloadable executive reports in the **Reports** section.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
