import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSiteContext } from '../context/SiteContext';
import usePageMeta from '../hooks/usePageMeta';
import {
  Boxes,
  Factory,
  Cpu,
  ShoppingBag,
  IndianRupee,
  Clock,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function Dashboard() {
  usePageMeta('Dashboard', 'Operational overview.');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSiteId, activeWarehouseId } = useSiteContext();
  const [loading, setLoading] = useState(true);

  const [metrics, setMetrics] = useState({
    totalMaterials: 0,
    totalStockUnits: 0,
    totalStockValuation: 0,
    activeProductionOrders: 0,
    scheduledPlans: 0,
    pendingApprovalsCount: 0
  });

  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [pendingAdjustments, setPendingAdjustments] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const [matRes, invRes, plansRes, ordersRes, trfRes, adjRes] = await Promise.all([
        api.get('/api/materials').catch(() => ({ data: { data: [] } })),
        api.get('/api/inventory', { params: query }).catch(() => ({ data: { data: [] } })),
        api.get('/api/production-plans', { params: query }).catch(() => ({ data: { data: [] } })),
        api.get('/api/production-orders', { params: query }).catch(() => ({ data: { data: [] } })),
        api.get('/api/transfers/pending').catch(() => ({ data: { data: [] } })),
        api.get('/api/stock-adjustments/pending').catch(() => ({ data: { data: [] } }))
      ]);

      const matData = matRes.data?.data || matRes.data || [];
      const invData = invRes.data?.data || invRes.data || [];
      const plansData = plansRes.data?.data || plansRes.data || [];
      const ordersData = ordersRes.data?.data || ordersRes.data || [];
      const trfData = trfRes.data?.data || trfRes.data || [];
      const adjData = adjRes.data?.data || adjRes.data || [];

      let totalUnits = 0, totalVal = 0;
      invData.forEach(item => {
        const bal = Number(item.balance || 0);
        const cost = Number(item.materialId?.unitCost || item.unitCost || 120);
        totalUnits += bal;
        totalVal += bal * cost;
      });

      setMetrics({
        totalMaterials: matData.length,
        totalStockUnits: totalUnits,
        totalStockValuation: totalVal,
        activeProductionOrders: ordersData.filter(o => ['PLANNED', 'IN_PROGRESS', 'RELEASED'].includes(o.status)).length,
        scheduledPlans: plansData.filter(p => p.status === 'SCHEDULED').length,
        pendingApprovalsCount: trfData.length + adjData.length
      });

      setPendingTransfers(trfData);
      setPendingAdjustments(adjData);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = [
    {
      label: 'Inventory',
      value: metrics.totalStockUnits.toLocaleString(),
      sub: `${metrics.totalMaterials} SKUs`,
      icon: Boxes,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      onClick: () => navigate('/inventory')
    },
    {
      label: 'Valuation',
      value: `₹${metrics.totalStockValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      sub: 'Standard cost',
      icon: IndianRupee,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
      onClick: () => navigate('/inventory')
    },
    {
      label: 'Plans',
      value: metrics.scheduledPlans,
      sub: 'Scheduled',
      icon: Cpu,
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      onClick: () => navigate('/planning')
    },
    {
      label: 'Production',
      value: metrics.activeProductionOrders,
      sub: 'Active orders',
      icon: Factory,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      onClick: () => navigate('/production')
    },
    {
      label: 'Approvals',
      value: metrics.pendingApprovalsCount,
      sub: metrics.pendingApprovalsCount > 0 ? 'Pending' : 'All clear',
      icon: Clock,
      color: metrics.pendingApprovalsCount > 0
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-slate-500 bg-slate-50 border-slate-200',
      onClick: () => navigate('/admin/control-center')
    }
  ];

  return (
    <div className="space-y-4 font-sans text-slate-900">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-[11px] text-slate-400 font-medium">
            Welcome, {user?.username || 'Admin'} — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              onClick={kpi.onClick}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm hover:-translate-y-0.5 ${kpi.color}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{kpi.label}</span>
                <Icon className="h-3.5 w-3.5 opacity-60" />
              </div>
              <p className="text-xl font-black leading-tight">{kpi.value}</p>
              <p className="text-[10px] font-medium opacity-60 mt-0.5">{kpi.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Pending Approvals — only show if there are any */}
      {metrics.pendingApprovalsCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Pending Approvals ({metrics.pendingApprovalsCount})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingTransfers.slice(0, 5).map(t => (
              <div key={t._id} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/60">
                <div>
                  <span className="font-bold text-slate-800">{t.transferNumber || 'Transfer'}</span>
                  <span className="text-slate-400 ml-2">{t.materialId?.name || 'Material'} — Qty {t.quantity || 0}</span>
                </div>
                <button
                  onClick={async () => {
                    try { await api.post(`/api/transfers/${t._id}/approve`); fetchData(); } catch (e) {}
                  }}
                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-bold text-[10px] uppercase border border-emerald-200"
                >
                  Approve
                </button>
              </div>
            ))}
            {pendingAdjustments.slice(0, 5).map(a => (
              <div key={a._id} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/60">
                <div>
                  <span className="font-bold text-slate-800">{a.adjustmentNumber || 'Adjustment'}</span>
                  <span className="text-slate-400 ml-2">{a.materialId?.name || 'Material'} — {a.adjustmentType} {a.quantity || 0}</span>
                </div>
                <button
                  onClick={async () => {
                    try { await api.post(`/api/stock-adjustments/${a._id}/approve`); fetchData(); } catch (e) {}
                  }}
                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-bold text-[10px] uppercase border border-emerald-200"
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Materials', path: '/masters', icon: Boxes },
          { label: 'BOM & Recipes', path: '/bom', icon: ShoppingBag },
          { label: 'Inventory', path: '/inventory', icon: Boxes },
          { label: 'Purchasing', path: '/purchasing', icon: ShoppingBag }
        ].map(link => {
          const Icon = link.icon;
          return (
            <button
              key={link.label}
              onClick={() => navigate(link.path)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
            >
              <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500" />
              <span>{link.label}</span>
              <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
