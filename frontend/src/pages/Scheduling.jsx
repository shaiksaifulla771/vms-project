import React, { useState, useEffect } from 'react';
import api from '../services/api';
import schedulingService from '../services/schedulingService';
import productionPlanService from '../services/productionPlanService';
import SiteWarehouseSelector, { getStoredContext } from '../components/SiteWarehouseSelector';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  CalendarClock, Clock, Plus, CheckCircle2, AlertTriangle, RefreshCw,
  XCircle, Filter, CheckCircle
} from 'lucide-react';

const TABS = [
  { id: 'scheduled', label: '1. Scheduled Plans', icon: CalendarClock },
  { id: 'unscheduled', label: '2. Unscheduled Plans', icon: Clock },
  { id: 'manual', label: '3. Create Manual Plan', icon: Plus },
  { id: 'cancelled', label: '4. Cancelled Plans', icon: XCircle },
];

const Scheduling = () => {
  const [activeTab, setActiveTab] = useState('scheduled');
  const [context, setContext] = useState(getStoredContext());
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Form state for Manual Production Plan creation
  const [manualForm, setManualForm] = useState({
    productId: '',
    bomId: '',
    quantity: 100,
    requiredDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    priority: 'Medium',
    reason: 'Urgent customer demand',
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const query = {};
      if (context.siteId) query.siteId = context.siteId;
      if (context.warehouseId) query.warehouseId = context.warehouseId;

      const [plansRes, ordersRes, matRes, bomRes, whRes] = await Promise.all([
        api.get('/api/production-plans', { params: query }),
        api.get('/api/productions', { params: query }),
        api.get('/api/materials'),
        api.get('/api/boms'),
        api.get('/api/warehouses')
      ]);

      setPlans(plansRes.data?.data || []);
      setOrders(ordersRes.data?.data || []);
      setMaterials((matRes.data?.data || matRes.data?.materials || []).filter(m => m.type === 'Finished' || m.type === 'Semi-Finished'));
      setBoms(bomRes.data?.data || bomRes.data?.boms || []);
      setWarehouses(whRes.data?.warehouses || whRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load scheduling workbench:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [context.siteId, context.warehouseId]);

  // Schedule Action: Unscheduled -> Scheduled
  const handleSchedule = async (planId, planNumber) => {
    setActionLoadingId(planId);
    setToastMsg(null);
    try {
      const res = await schedulingService.schedulePlan(planId);
      if (res.success || res.order) {
        setToastMsg({
          type: 'success',
          text: `✓ Plan ${planNumber} scheduled! Generated Order: ${res.order?.prdNumber || 'PO'} — Soft inventory reserved.`
        });
        await fetchData();
        setActiveTab('scheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to schedule ${planNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Unschedule Action: Scheduled -> Unscheduled (releases soft reservation)
  const handleUnschedule = async (planId, planNumber) => {
    setActionLoadingId(planId);
    setToastMsg(null);
    try {
      const res = await schedulingService.unschedulePlan(planId);
      if (res.success) {
        setToastMsg({
          type: 'info',
          text: `↺ Plan ${planNumber} unscheduled. Soft reservation released and linked order cancelled.`
        });
        await fetchData();
        setActiveTab('unscheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to unschedule ${planNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel Plan Action: Scheduled/Unscheduled -> Cancelled
  const handleCancelPlan = async (planId, planNumber) => {
    const reason = window.prompt(`Enter reason for cancelling Plan ${planNumber}:`, 'Planner cancellation');
    if (!reason) return;

    setActionLoadingId(planId);
    try {
      const res = await api.post(`/api/production-plans/${planId}/cancel`, { reason });
      if (res.data?.success) {
        setToastMsg({ type: 'info', text: `Plan ${planNumber} cancelled. Reservations released.` });
        await fetchData();
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Cancellation failed.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Manual Production Plan Creation Handler
  const handleCreateManualPlan = async (e) => {
    e.preventDefault();
    if (!manualForm.productId || !manualForm.bomId) {
      alert('Please select a Finished Product and BOM recipe.');
      return;
    }

    const targetWh = context.warehouseId || (warehouses[0] ? warehouses[0]._id : '');
    if (!targetWh) {
      alert('Please select an operational Warehouse context.');
      return;
    }

    try {
      const payload = {
        ...manualForm,
        warehouseId: targetWh,
        siteId: context.siteId,
        planSource: 'Manual',
        status: 'Unscheduled',
      };

      const res = await productionPlanService.createProductionPlan(payload);
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Manual Production Plan ${res.data?.planNumber || ''} created successfully!`
        });
        await fetchData();
        setActiveTab('unscheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create manual plan.' });
    }
  };

  // Filtered plan lists
  const scheduledPlans = plans.filter(p => p.status === 'Scheduled');
  const unscheduledPlans = plans.filter(p => ['Unscheduled', 'Pending', 'Draft'].includes(p.status));
  const cancelledPlans = plans.filter(p => p.status === 'Cancelled');

  return (
    <div className="space-y-6">
      {/* Site / Warehouse Context Selector */}
      <SiteWarehouseSelector onContextChange={setContext} />



      {/* Toast Feedback */}
      {toastMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between shadow-sm ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
             : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 text-sm font-bold">×</button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">SCHEDULED PLANS</span>
          <div className="text-2xl font-black text-blue-600 font-mono">{loading ? '...' : scheduledPlans.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Soft Reserved Inventory</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">UNSCHEDULED PLANS</span>
          <div className="text-2xl font-black text-amber-600 font-mono">{loading ? '...' : unscheduledPlans.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Awaiting Scheduling</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">MANUAL CREATED</span>
          <div className="text-2xl font-black text-purple-600 font-mono">
            {loading ? '...' : plans.filter(p => p.planSource === 'Manual').length}
          </div>
          <span className="text-[10px] text-slate-500 block font-medium">Direct Planned Commitments</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">CANCELLED PLANS</span>
          <div className="text-2xl font-black text-rose-600 font-mono">{loading ? '...' : cancelledPlans.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Archived Audit Trail</span>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 pt-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px ${
                isActive
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SCHEDULED PLANS */}
      {activeTab === 'scheduled' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>SCHEDULED PRODUCTION PLANS (SOFT RESERVED)</span>
              <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px]">
                {scheduledPlans.length} Scheduled
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Linked PO</th>
                    <th className="p-4">Plan Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Quantity</th>
                    <th className="p-4">Priority / Source</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {scheduledPlans.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                        No scheduled plans. Click <strong>Schedule</strong> on an unscheduled plan.
                      </td>
                    </tr>
                  ) : (
                    scheduledPlans.map((plan) => {
                      const linkedOrder = orders.find(o => (o.planId?._id || o.planId) === plan._id);
                      return (
                        <tr key={plan._id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-bold text-indigo-600">{linkedOrder?.prdNumber || '—'}</td>
                          <td className="p-4 font-mono font-bold text-slate-900">{plan.planNumber}</td>
                          <td className="p-4 font-bold text-slate-900">{plan.productId?.name || 'Product'}</td>
                          <td className="p-4 font-mono font-bold text-blue-600">{plan.quantity} {plan.productId?.unit}</td>
                          <td className="p-4 text-slate-600">
                            <span className="font-semibold text-slate-800">{plan.priority || 'Medium'}</span>
                            <span className="text-slate-400 text-[10px] block">({plan.planSource || 'MRP'})</span>
                          </td>
                          <td className="p-4 text-center">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Scheduled
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={actionLoadingId === plan._id}
                              onClick={() => handleUnschedule(plan._id, plan.planNumber)}
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs"
                            >
                              Unschedule
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancelPlan(plan._id, plan.planNumber)}
                              className="border-slate-200 text-slate-500 hover:text-slate-800 font-bold text-xs"
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: UNSCHEDULED PLANS */}
      {activeTab === 'unscheduled' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>UNSCHEDULED PRODUCTION PLANS (AWAITING SCHEDULE)</span>
              <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[10px]">
                {unscheduledPlans.length} Unscheduled
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Plan Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Quantity</th>
                    <th className="p-4">Required Date</th>
                    <th className="p-4">Priority / Source</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {unscheduledPlans.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                        No unscheduled plans found. Create a manual plan in <strong>Create Manual Plan</strong> tab or run MRP.
                      </td>
                    </tr>
                  ) : (
                    unscheduledPlans.map((plan) => (
                      <tr key={plan._id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono font-bold text-slate-900">{plan.planNumber}</td>
                        <td className="p-4 font-bold text-slate-900">{plan.productId?.name || 'Product'}</td>
                        <td className="p-4 font-mono font-bold text-blue-600">{plan.quantity} {plan.productId?.unit}</td>
                        <td className="p-4 font-mono text-slate-500">{plan.requiredDate ? new Date(plan.requiredDate).toLocaleDateString() : 'N/A'}</td>
                        <td className="p-4 text-slate-600">
                          <span className="font-semibold text-slate-800">{plan.priority || 'Medium'}</span>
                          <span className="text-slate-400 text-[10px] block">({plan.planSource || 'MRP'})</span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Unscheduled
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === plan._id}
                            onClick={() => handleSchedule(plan._id, plan.planNumber)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                          >
                            Schedule
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelPlan(plan._id, plan.planNumber)}
                            className="border-slate-200 text-slate-500 hover:text-slate-800 font-bold text-xs"
                          >
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: CREATE MANUAL PLAN */}
      {activeTab === 'manual' && (
        <Card className="bg-white border-slate-200 shadow-sm max-w-2xl mx-auto">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Plus className="h-4 w-4 text-purple-600" />
              Create Manual Production Plan (Without MRP)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreateManualPlan} className="space-y-4 text-xs font-medium text-slate-700">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Finished Product *</label>
                <select
                  value={manualForm.productId}
                  onChange={(e) => {
                    const prodId = e.target.value;
                    const matchingBom = boms.find(b => (b.productId?._id || b.productId) === prodId);
                    setManualForm({
                      ...manualForm,
                      productId: prodId,
                      bomId: matchingBom ? matchingBom._id : ''
                    });
                  }}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Select Finished Product --</option>
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Associated BOM Recipe *</label>
                <select
                  value={manualForm.bomId}
                  onChange={(e) => setManualForm({ ...manualForm, bomId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Select BOM Recipe --</option>
                  {boms.map(b => (
                    <option key={b._id} value={b._id}>{b.bomNumber} - Batch Size: {b.batchSize} {b.batchUOM}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Target Quantity *</label>
                  <input
                    type="number"
                    value={manualForm.quantity}
                    onChange={(e) => setManualForm({ ...manualForm, quantity: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Required Date *</label>
                  <input
                    type="date"
                    value={manualForm.requiredDate}
                    onChange={(e) => setManualForm({ ...manualForm, requiredDate: e.target.value })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Priority</label>
                  <select
                    value={manualForm.priority}
                    onChange={(e) => setManualForm({ ...manualForm, priority: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-bold"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Reason / Customer Reference</label>
                <input
                  type="text"
                  value={manualForm.reason}
                  onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50"
                  placeholder="e.g. Urgent customer order"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button size="sm" type="submit" className="bg-purple-600 text-white font-bold px-6 py-2 rounded-xl">
                  Create Manual Planned Order
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* TAB 4: CANCELLED PLANS */}
      {activeTab === 'cancelled' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>CANCELLED PRODUCTION PLANS (AUDIT HISTORY)</span>
              <Badge variant="outline" className="border-rose-200 text-rose-700 bg-rose-50 text-[10px]">
                {cancelledPlans.length} Cancelled
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Plan Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Quantity</th>
                    <th className="p-4">Cancellation Reason</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {cancelledPlans.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400 text-xs">No cancelled plans.</td>
                    </tr>
                  ) : (
                    cancelledPlans.map((plan) => (
                      <tr key={plan._id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono font-bold text-rose-600">{plan.planNumber}</td>
                        <td className="p-4 font-bold text-slate-900">{plan.productId?.name || 'Product'}</td>
                        <td className="p-4 font-mono text-slate-700">{plan.quantity}</td>
                        <td className="p-4 text-rose-700">{plan.cancelReason || plan.notes || 'Cancelled'}</td>
                        <td className="p-4 text-center">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Cancelled
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Scheduling;
