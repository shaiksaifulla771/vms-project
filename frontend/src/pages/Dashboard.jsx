import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useSiteContext } from '../context/SiteContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  LayoutDashboard,
  Boxes,
  Factory,
  Cpu,
  ShoppingBag,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  ArrowRightLeft,
  Sliders,
  IndianRupee,
  TrendingUp,
  UserCheck,
  CalendarCheck,
  Building2
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeSiteId, activeWarehouseId } = useSiteContext();
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Executive Metrics
  const [metrics, setMetrics] = useState({
    totalSites: 0,
    totalWarehouses: 0,
    totalMaterials: 0,
    totalStockUnits: 0,
    totalStockValuation: 0,
    activeProductionOrders: 0,
    scheduledPlans: 0,
    unscheduledPlans: 0,
    pendingApprovalsCount: 0
  });

  // Approvals & Telemetry Data
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  const [pendingAppointments, setPendingAppointments] = useState([]);
  const [recentPlans, setRecentPlans] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const [
        sitesRes,
        whRes,
        matRes,
        invRes,
        plansRes,
        ordersRes,
        transfersRes,
        adjRes,
        apptRes,
        txRes
      ] = await Promise.all([
        api.get('/api/sites').catch(() => ({ data: { data: [] } })),
        api.get('/api/warehouses').catch(() => ({ data: { data: [] } })),
        api.get('/api/materials').catch(() => ({ data: { data: [] } })),
        api.get('/api/inventory', { params: query }).catch(() => ({ data: { data: [], summary: {} } })),
        api.get('/api/production-plans', { params: query }).catch(() => ({ data: { data: [] } })),
        api.get('/api/productions', { params: query }).catch(() => ({ data: { data: [] } })),
        api.get('/api/transfers?status=Pending Approval').catch(() => ({ data: { data: [] } })),
        api.get('/api/inventory/adjustments?status=Pending Approval').catch(() => ({ data: { data: [] } })),
        api.get('/api/appointments').catch(() => ({ data: { appointments: [] } })),
        api.get('/api/inventory/ledger?limit=10', { params: query }).catch(() => ({ data: { data: [] } }))
      ]);

      const sitesList = sitesRes.data?.sites || sitesRes.data?.data || [];
      const whList = whRes.data?.warehouses || whRes.data?.data || [];
      const matList = matRes.data?.materials || matRes.data?.data || [];
      const invSummary = invRes.data?.summary || {};
      const plansList = plansRes.data?.plans || plansRes.data?.data || [];
      const ordersList = ordersRes.data?.orders || ordersRes.data?.data || [];
      const trfList = transfersRes.data?.data || [];
      const adjList = adjRes.data?.data || [];
      const apptList = apptRes.data?.appointments || apptRes.data?.data || [];
      const txList = txRes.data?.data || [];

      const pendingAppts = apptList.filter(a => a.status === 'Pending Approval' || a.status === 'PENDING_APPROVAL');
      const totalPending = trfList.length + adjList.length + pendingAppts.length;

      const activeOrders = ordersList.filter(o => ['In Production', 'In Progress', 'Scheduled'].includes(o.status));
      const scheduledP = plansList.filter(p => p.status === 'SCHEDULED');
      const unscheduledP = plansList.filter(p => p.status === 'UNSCHEDULED');

      setMetrics({
        totalSites: sitesList.length,
        totalWarehouses: whList.length,
        totalMaterials: matList.length,
        totalStockUnits: invSummary.totalOnHandUnits || 0,
        totalStockValuation: invSummary.totalStockValuation || 0,
        activeProductionOrders: activeOrders.length,
        scheduledPlans: scheduledP.length,
        unscheduledPlans: unscheduledP.length,
        pendingApprovalsCount: totalPending
      });

      setPendingTransfers(trfList);
      setPendingAdjustments(adjList);
      setPendingAppointments(pendingAppts);
      setRecentPlans(plansList.slice(0, 5));
      setRecentOrders(ordersList.slice(0, 5));
      setRecentTransactions(txList.slice(0, 6));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Quick Approval Handlers
  const handleApproveAdjustment = async (id, adjNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/inventory/adjustments/${id}/approve`);
      setToastMsg({ type: 'success', text: `Stock adjustment ${adjNum} approved.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Approval failed.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveTransfer = async (id, trfNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/transfers/${id}/approve`);
      setToastMsg({ type: 'success', text: `Transfer ${trfNum} approved.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Approval failed.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveAppointment = async (id, num) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/appointments/${id}/approve`);
      setToastMsg({ type: 'success', text: `Appointment approved.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Approval failed.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-5 font-sans text-slate-900 bg-slate-50/60 min-h-screen p-3 md:p-6">
      {/* HEADER SECTION */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-slate-900 text-white rounded-md flex items-center gap-1">
                <LayoutDashboard className="h-3.5 w-3.5" /> Executive Operations
              </span>
              <span className="text-xs text-slate-500 font-medium">● Enterprise Platform Overview</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Dashboard
            </h1>
            <p className="text-xs text-slate-500 max-w-3xl">
              High-level operational overview across inventory valuation, production status, pending authorizations, and system activity.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchDashboardData}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 text-xs font-bold"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* TOAST ALERT */}
        {toastMsg && (
          <div className={`p-3.5 rounded-xl text-xs font-bold border flex items-center justify-between shadow-sm animate-fadeIn ${
            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center space-x-2">
              {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
              <span>{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">×</button>
          </div>
        )}
      </section>

      {/* EXECUTIVE KEY METRICS TILES */}
      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-5">
        <div
          onClick={() => navigate('/inventory')}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-1 hover:border-blue-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Inventory Stock</span>
            <Boxes className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{metrics.totalStockUnits.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span></p>
          <p className="text-[11px] text-slate-500 font-medium">Across {metrics.totalMaterials} Material SKUs</p>
        </div>

        <div
          onClick={() => navigate('/inventory')}
          className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 shadow-sm space-y-1 hover:border-purple-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Stock Valuation</span>
            <IndianRupee className="h-4 w-4 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-purple-900">₹{metrics.totalStockValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-purple-600/80 font-medium">Standard Cost Inventory Valuation</p>
        </div>

        <div
          onClick={() => navigate('/planning')}
          className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm space-y-1 hover:border-orange-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-orange-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">MRP Production Plans</span>
            <Cpu className="h-4 w-4 text-orange-600" />
          </div>
          <p className="text-2xl font-black text-orange-900">{metrics.scheduledPlans + metrics.unscheduledPlans} <span className="text-xs font-normal text-orange-600">plans</span></p>
          <p className="text-[11px] text-orange-600/80 font-medium">{metrics.scheduledPlans} Scheduled &bull; {metrics.unscheduledPlans} Unscheduled</p>
        </div>

        <div
          onClick={() => navigate('/production')}
          className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm space-y-1 hover:border-blue-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Production Orders</span>
            <Factory className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-900">{metrics.activeProductionOrders} <span className="text-xs font-normal text-blue-600">active</span></p>
          <p className="text-[11px] text-blue-600/80 font-medium">Shop Floor Manufacturing Orders</p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-sm space-y-1 ${
            metrics.pendingApprovalsCount > 0
              ? 'bg-amber-50/60 border-amber-200 text-amber-800'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Pending Approvals</span>
            <Clock className={`h-4 w-4 ${metrics.pendingApprovalsCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          </div>
          <p className="text-2xl font-black">{metrics.pendingApprovalsCount}</p>
          <p className="text-[11px] font-medium">
            {metrics.pendingApprovalsCount > 0 ? 'Action Required Below' : 'All Clear — No Pending Actions'}
          </p>
        </div>
      </div>

      {/* MAIN 2-COLUMN DASHBOARD GRID */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT COLUMN (2 Cols): ACTION CENTER & RECENT PRODUCTION */}
        <div className="lg:col-span-2 space-y-4">
          {/* PENDING APPROVALS HUB */}
          {metrics.pendingApprovalsCount > 0 && (
            <Card className="bg-white border-amber-200 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-amber-50/50 border-b border-amber-100 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Authorizations Pending Action ({metrics.pendingApprovalsCount})
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                  Requires Review
                </Badge>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {/* Pending Stock Adjustments */}
                {pendingAdjustments.map(adj => (
                  <div key={adj._id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono font-bold text-blue-600">{adj.adjNumber}</span>
                        <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded text-[9px] font-bold uppercase">Stock Adjustment</span>
                      </div>
                      <p className="font-extrabold text-slate-900">{adj.materialId?.name} &bull; {adj.adjustmentType} {adj.quantity} {adj.materialId?.unit || 'pcs'}</p>
                      <p className="text-[10px] text-slate-500">Warehouse: {adj.warehouseId?.name} &bull; Reason: {adj.reason}</p>
                    </div>
                    <button
                      onClick={() => handleApproveAdjustment(adj._id, adj.adjNumber)}
                      disabled={actionLoadingId === adj._id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors shrink-0"
                    >
                      Approve
                    </button>
                  </div>
                ))}

                {/* Pending Stock Transfers */}
                {pendingTransfers.map(trf => (
                  <div key={trf._id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono font-bold text-indigo-600">{trf.transferNumber}</span>
                        <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded text-[9px] font-bold uppercase">Inter-Warehouse Transfer</span>
                      </div>
                      <p className="font-extrabold text-slate-900">{trf.materialId?.name} &bull; {trf.quantity} {trf.materialId?.unit || 'pcs'}</p>
                      <p className="text-[10px] text-slate-500">{trf.fromWarehouseId?.name} &rarr; {trf.toWarehouseId?.name}</p>
                    </div>
                    <button
                      onClick={() => handleApproveTransfer(trf._id, trf.transferNumber)}
                      disabled={actionLoadingId === trf._id}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors shrink-0"
                    >
                      Approve
                    </button>
                  </div>
                ))}

                {/* Pending Appointments */}
                {pendingAppointments.map(appt => (
                  <div key={appt._id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono font-bold text-slate-700">{appt.appointmentNumber || 'APPT'}</span>
                        <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded text-[9px] font-bold uppercase">Visitor Gate Pass</span>
                      </div>
                      <p className="font-extrabold text-slate-900">{appt.visitorName || appt.name} &bull; Host: {appt.hostName || 'Staff'}</p>
                    </div>
                    <button
                      onClick={() => handleApproveAppointment(appt._id, appt.appointmentNumber)}
                      disabled={actionLoadingId === appt._id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors shrink-0"
                    >
                      Approve
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ACTIVE MRP PLANS & PRODUCTION ORDERS */}
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 p-4 flex items-center justify-between">
              <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="h-4 w-4 text-orange-600" />
                <span>Production Plans & Manufacturing Orders</span>
              </CardTitle>
              <button
                onClick={() => navigate('/planning')}
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <span>View Workbench</span> <ArrowRight className="h-3 w-3" />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Plan Code & Name</th>
                      <th className="p-3.5">Target Product</th>
                      <th className="p-3.5 text-center">Available / Total</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {recentPlans.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 text-xs italic">
                          No production plans generated yet.
                        </td>
                      </tr>
                    ) : (
                      recentPlans.map(plan => (
                        <tr key={plan._id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5 font-mono font-bold text-blue-600">
                            {plan.planNumber}
                            <span className="block text-[11px] font-sans text-slate-900 font-bold">{plan.planName || 'Plan'}</span>
                          </td>
                          <td className="p-3.5">
                            <p className="font-extrabold text-slate-900">{plan.productId?.name || plan.productName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{plan.productId?.code || plan.productCode}</p>
                          </td>
                          <td className="p-3.5 text-center font-mono font-bold">
                            <span className="text-emerald-700">{plan.availablePlans ?? plan.quantity}</span>
                            <span className="text-slate-400"> / </span>
                            <span className="text-slate-800">{plan.totalPlans || plan.quantity}</span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-0.5 rounded font-extrabold text-[10px] uppercase bg-slate-100 text-slate-700">
                              {plan.status || 'UNSCHEDULED'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => navigate('/planning')}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px]"
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN (1 Col): QUICK SHORTCUTS & AUDIT FEED */}
        <div className="space-y-4">
          {/* QUICK SHORTCUTS */}
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Module Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/planning')}
                className="p-3 bg-slate-50 hover:bg-orange-50/50 border border-slate-200 hover:border-orange-200 rounded-xl text-left transition-all group"
              >
                <Cpu className="h-4 w-4 text-orange-600 mb-1" />
                <span className="block text-xs font-bold text-slate-900 group-hover:text-orange-700">Run MRP</span>
                <span className="text-[10px] text-slate-500">Calculate Netting</span>
              </button>

              <button
                onClick={() => navigate('/inventory')}
                className="p-3 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-200 rounded-xl text-left transition-all group"
              >
                <Boxes className="h-4 w-4 text-blue-600 mb-1" />
                <span className="block text-xs font-bold text-slate-900 group-hover:text-blue-700">Stock Check</span>
                <span className="text-[10px] text-slate-500">Physical Balances</span>
              </button>

              <button
                onClick={() => navigate('/masters')}
                className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 rounded-xl text-left transition-all group"
              >
                <Factory className="h-4 w-4 text-indigo-600 mb-1" />
                <span className="block text-xs font-bold text-slate-900 group-hover:text-indigo-700">Master Data</span>
                <span className="text-[10px] text-slate-500">BOM & Materials</span>
              </button>

              <button
                onClick={() => navigate('/purchasing')}
                className="p-3 bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition-all group"
              >
                <ShoppingBag className="h-4 w-4 text-emerald-600 mb-1" />
                <span className="block text-xs font-bold text-slate-900 group-hover:text-emerald-700">Procurement</span>
                <span className="text-[10px] text-slate-500">Purchase Orders</span>
              </button>
            </div>
          </Card>

          {/* RECENT INVENTORY & AUDIT ACTIVITY */}
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Live Inventory Activity Feed</h3>
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {recentTransactions.length === 0 ? (
                <p className="text-slate-400 text-xs italic text-center py-4">No recent activity.</p>
              ) : (
                recentTransactions.map(tx => (
                  <div key={tx._id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-0.5">
                    <div className="flex justify-between items-center text-[10px] text-slate-500">
                      <span className="font-extrabold uppercase font-mono">{tx.type}</span>
                      <span>{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="font-bold text-slate-900 truncate">{tx.materialId?.name || 'Material'}</p>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-500">{tx.warehouseId?.name || 'Warehouse'}</span>
                      <span className={`font-mono font-extrabold ${tx.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} {tx.materialId?.unit || 'pcs'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
