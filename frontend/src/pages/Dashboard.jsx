import React, { useEffect, useState } from 'react';
import api from '../services/api';
import SiteWarehouseSelector, { getStoredContext } from '../components/SiteWarehouseSelector';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Boxes, Factory, CalendarClock, ShieldCheck, CheckCircle2,
  RefreshCw, AlertTriangle
} from 'lucide-react';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [schedulingMetrics, setSchedulingMetrics] = useState({ pending: 0, scheduled: 0, inProduction: 0, completed: 0 });
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  const [pendingAppointments, setPendingAppointments] = useState([]);
  const [context, setContext] = useState(getStoredContext());
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const query = {};
      if (context.siteId) query.siteId = context.siteId;
      if (context.warehouseId) query.warehouseId = context.warehouseId;

      const [summaryRes, plansRes, ordersRes, transfersRes, adjRes, apptRes] = await Promise.all([
        api.get('/reports/summary', { params: query }),
        api.get('/production-plans', { params: query }),
        api.get('/productions', { params: query }),
        api.get('/transfers?status=Pending Approval'),
        api.get('/inventory/adjustments?status=Pending Approval'),
        api.get('/appointments')
      ]);

      if (summaryRes.data && summaryRes.data.success) {
        setSummaryData(summaryRes.data.data.summary);
      }

      const plans = plansRes.data?.data || [];
      const orders = ordersRes.data?.data || [];

      const pendingPlans = plans.filter(p => ['Unscheduled', 'Pending', 'Draft'].includes(p.status));
      const scheduledPlans = plans.filter(p => p.status === 'Scheduled');
      const activeOrders = orders.filter(o => ['In Production', 'In Progress'].includes(o.status));
      const doneOrders = orders.filter(o => o.status === 'Completed');

      setSchedulingMetrics({
        pending: pendingPlans.length,
        scheduled: scheduledPlans.length,
        inProduction: activeOrders.length,
        completed: doneOrders.length
      });

      setPendingTransfers(transfersRes.data?.data || []);
      setPendingAdjustments(adjRes.data?.data || []);
      
      const appts = apptRes.data?.appointments || apptRes.data?.data || [];
      setPendingAppointments(appts.filter(a => a.status === 'Pending Approval' || a.status === 'PENDING_APPROVAL'));
    } catch (err) {
      console.error('Error fetching dashboard telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [context.siteId, context.warehouseId]);

  // Approval action handlers
  const handleApproveTransfer = async (id, trfNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/transfers/${id}/approve`);
      setToastMsg({ type: 'success', text: `Transfer ${trfNum} approved.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to approve transfer.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveAdjustment = async (id, adjNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/inventory/adjustments/${id}/approve`);
      setToastMsg({ type: 'success', text: `Adjustment ${adjNum} approved.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to approve adjustment.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveAppointment = async (id, num) => {
    setActionLoadingId(id);
    try {
      await api.post(`/appointments/${id}/approve`);
      setToastMsg({ type: 'success', text: `Appointment ${num} approved.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to approve appointment.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectAppointment = async (id, num) => {
    setActionLoadingId(id);
    try {
      await api.post(`/appointments/${id}/reject`, { rejectionReason: 'Rejected from dashboard' });
      setToastMsg({ type: 'info', text: `Appointment ${num} rejected.` });
      fetchDashboardData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to reject appointment.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalPendingApprovals = pendingTransfers.length + pendingAdjustments.length + pendingAppointments.length;

  return (
    <div className="space-y-4">
      {/* Operating Context Selector */}
      <SiteWarehouseSelector onContextChange={setContext} />



      {/* Toast alert */}
      {toastMsg && (
        <div className={`p-3 rounded-lg text-xs font-semibold border flex items-center justify-between ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
             : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold">×</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Inventory Stock */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Physical Stock</span>
            <Boxes className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {loading ? '...' : (summaryData?.totalStockQuantity || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">On-Hand Units</span>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pending Approvals</span>
            <ShieldCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono">
            {loading ? '...' : totalPendingApprovals}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Transfers & Adjustments</span>
        </div>

        {/* Scheduling Plans */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Scheduled Plans</span>
            <CalendarClock className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-600 font-mono">
            {loading ? '...' : schedulingMetrics.scheduled}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">{schedulingMetrics.pending} Pending</span>
        </div>

        {/* Production Execution */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Active Production</span>
            <Factory className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">
            {loading ? '...' : schedulingMetrics.inProduction}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">{schedulingMetrics.completed} Completed</span>
        </div>
      </div>

      {/* PENDING APPROVAL INBOX */}
      <Card className="bg-white border-slate-200 shadow-xs">
        <CardHeader className="border-b border-slate-100 py-3">
          <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
            <span className="flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              <span>Pending Approval Inbox</span>
            </span>
            <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-50 text-[10px]">
              {totalPendingApprovals} Action Required
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Ref Code</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Material</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Route / Reason</th>
                  <th className="p-3">Created By</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {totalPendingApprovals === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-slate-400 text-xs">
                      No pending approvals.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Stock Transfers */}
                    {pendingTransfers.map((trf) => (
                      <tr key={trf._id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-medium text-slate-900">{trf.transferNumber}</td>
                        <td className="p-3 font-medium text-slate-600">Transfer</td>
                        <td className="p-3 font-bold text-slate-900">{trf.materialId?.name}</td>
                        <td className="p-3 font-mono text-slate-900">{trf.quantity} {trf.materialId?.unit}</td>
                        <td className="p-3 text-slate-600">{trf.fromWarehouseId?.name} → {trf.toWarehouseId?.name}</td>
                        <td className="p-3 font-mono text-slate-500">{trf.createdBy?.username || 'User'}</td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === trf._id}
                            onClick={() => handleApproveTransfer(trf._id, trf.transferNumber)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-1 rounded-md"
                          >
                            Approve
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {/* Stock Adjustments */}
                    {pendingAdjustments.map((adj) => (
                      <tr key={adj._id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-medium text-slate-900">{adj.adjNumber}</td>
                        <td className="p-3 font-medium text-slate-600">
                          Adjustment ({adj.adjustmentType})
                        </td>
                        <td className="p-3 font-bold text-slate-900">{adj.materialId?.name}</td>
                        <td className="p-3 font-mono text-slate-900">
                          {adj.adjustmentType === 'IN' ? '+' : '-'}{adj.quantity}
                        </td>
                        <td className="p-3 text-slate-600">{adj.reason}</td>
                        <td className="p-3 font-mono text-slate-500">{adj.createdBy?.username || 'User'}</td>
                        <td className="p-3 text-right space-x-2">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === adj._id}
                            onClick={() => handleApproveAdjustment(adj._id, adj.adjNumber)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-1 rounded-md"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={actionLoadingId === adj._id}
                            onClick={() => handleRejectAdjustment(adj._id, adj.adjNumber)}
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-[11px] px-2.5 py-1 rounded-md"
                          >
                            Reject
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {/* VMS Appointments */}
                    {pendingAppointments.map((apt) => (
                      <tr key={apt._id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-medium text-slate-900">{apt.appointmentNumber}</td>
                        <td className="p-3 font-medium text-slate-600">Visitor Appointment</td>
                        <td className="p-3 font-bold text-slate-900">{apt.visitorId?.fullName || apt.visitorName || 'Visitor'}</td>
                        <td className="p-3 font-mono text-slate-900">1 Person</td>
                        <td className="p-3 text-slate-600">{apt.purpose}</td>
                        <td className="p-3 font-mono text-slate-500">{apt.hostUserId?.username || apt.employeeName || 'Host'}</td>
                        <td className="p-3 text-right space-x-2">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === apt._id}
                            onClick={() => handleApproveAppointment(apt._id, apt.appointmentNumber)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-1 rounded-md"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={actionLoadingId === apt._id}
                            onClick={() => handleRejectAppointment(apt._id, apt.appointmentNumber)}
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-[11px] px-2.5 py-1 rounded-md"
                          >
                            Reject
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
