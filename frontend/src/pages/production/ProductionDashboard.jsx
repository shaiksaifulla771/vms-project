import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutGrid, Factory, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Cpu, ArrowRight, ArrowUpRight, Play, Boxes, RefreshCw
} from 'lucide-react';
import api from '../../services/api';

const statusBadgeStyles = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  'Pending Approval': 'bg-amber-50 text-amber-800 border-amber-200',
  Approved: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  'Material Allocated': 'bg-blue-50 text-blue-800 border-blue-200',
  'In Production': 'bg-purple-50 text-purple-800 border-purple-200',
  'In Progress': 'bg-purple-50 text-purple-800 border-purple-200',
  'Quality Check': 'bg-amber-50 text-amber-800 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function ProductionDashboard() {
  const [stats, setStats] = useState({
    total: 0,
    inProgress: 0,
    completed: 0,
    qualityIssues: 0,
    recentOrders: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await api.get('/productions');
      const orders = res.data.data || [];
      
      const inProgress = orders.filter(o => {
        const s = (o.status || '').toUpperCase();
        return s === 'IN PRODUCTION' || s === 'IN PROGRESS' || s === 'MATERIAL ALLOCATED' || s === 'APPROVED';
      }).length;

      const completed = orders.filter(o => (o.status || '').toUpperCase() === 'COMPLETED').length;
      const qualityIssues = orders.filter(o => (o.status || '').toUpperCase() === 'REJECTED').length;

      setStats({
        total: orders.length,
        inProgress,
        completed,
        qualityIssues,
        recentOrders: orders.slice(0, 6)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="p-12 text-center text-slate-500 font-bold flex items-center justify-center gap-2">
      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> Loading shop floor dashboard...
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans text-slate-900 p-4 md:p-6">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-slate-900 text-white rounded-md flex items-center gap-1">
              <Factory className="h-3 w-3" /> Shop Floor Execution
            </span>
            <span className="text-xs text-slate-500 font-medium">● Manufacturing Orders & Workflows</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            Production Orders Dashboard
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Real-time tracking of shop floor production runs, material consumption, and quality inspection.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/mrp"
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 active:scale-95 hover:shadow-md"
          >
            <Cpu className="w-4 h-4" />
            <span>Open MRP Planner</span>
          </Link>

          <Link
            to="/production"
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 active:scale-95"
          >
            <Boxes className="w-4 h-4" />
            <span>All Production Orders</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Work Orders</p>
            <h3 className="text-3xl font-black text-slate-900">{stats.total}</h3>
            <p className="text-[10px] text-slate-500 font-medium">Generated from MRP & Manual</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Factory className="w-6 h-6" /></div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-purple-200 bg-purple-50/20 p-5 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Active In Production</p>
            <h3 className="text-3xl font-black text-purple-900">{stats.inProgress}</h3>
            <p className="text-[10px] text-purple-700 font-medium">On line / consuming materials</p>
          </div>
          <div className="p-3 bg-purple-100 text-purple-700 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 bg-emerald-50/20 p-5 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Completed Batches</p>
            <h3 className="text-3xl font-black text-emerald-900">{stats.completed}</h3>
            <p className="text-[10px] text-emerald-700 font-medium">Inventory posted to warehouse</p>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl"><CheckCircle2 className="w-6 h-6" /></div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 bg-rose-50/20 p-5 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Quality Holds / Scrap</p>
            <h3 className="text-3xl font-black text-rose-900">{stats.qualityIssues}</h3>
            <p className="text-[10px] text-rose-700 font-medium">Requires QA clearance</p>
          </div>
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl"><AlertTriangle className="w-6 h-6" /></div>
        </div>
      </div>

      {/* Recent Production Runs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900">Recent Shop Floor Production Runs</h2>
            <p className="text-xs text-slate-500">Live order execution status and MRP traceability</p>
          </div>
          <Link to="/production" className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            <span>View All Production Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {stats.recentOrders.map(order => (
            <Link
              key={order._id}
              to={`/production/${order._id}`}
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-white transition-all flex items-center justify-between group shadow-sm"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-black text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                    {order.prdNumber || order.orderNumber}
                  </span>
                  {order.sourcePlanNumber && (
                    <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded text-[10px] font-bold flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-amber-600" /> {order.sourcePlanNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {order.productId?.name || 'Product'} ● Target: <span className="font-bold text-slate-900">{order.targetQuantity || order.plannedQuantity} pcs</span>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${statusBadgeStyles[order.status] || 'bg-slate-100 text-slate-700'}`}>
                  {order.status}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))}
          {stats.recentOrders.length === 0 && (
            <div className="col-span-2 p-12 text-center text-slate-400 italic bg-slate-50 rounded-xl">
              No recent production orders. Release a plan from MRP or create a manual order.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
