import React, { useState, useEffect } from 'react';
import productionService from '../services/productionService';
import SiteWarehouseSelector, { getStoredContext } from '../components/SiteWarehouseSelector';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Factory, Play, CheckCircle, AlertTriangle, RefreshCw,
  Package, Clock, CheckCircle2, XCircle
} from 'lucide-react';

const TABS = [
  { id: 'orders', label: '1. Production Orders', icon: Clock },
  { id: 'shopfloor', label: '2. Shop Floor Execution', icon: Factory },
  { id: 'completed', label: '3. Completed Orders', icon: CheckCircle },
];

const Manufacturing = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [context, setContext] = useState(getStoredContext());
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Fetch production orders filtered by operational context
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const query = {};
      if (context.siteId) query.siteId = context.siteId;
      if (context.warehouseId) query.warehouseId = context.warehouseId;

      const res = await productionService.getProductionOrders(query);
      setOrders(res.data || res.orders || []);
    } catch (err) {
      console.error('Failed to fetch production orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [context.siteId, context.warehouseId]);

  // Handle Start Production: Scheduled -> In Production
  const handleStartProduction = async (id, prdNumber) => {
    setActionLoadingId(id);
    setToastMsg(null);
    try {
      const res = await productionService.startProduction(id);
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `▶ Order ${prdNumber} is now IN PRODUCTION on shop floor!`
        });
        await fetchOrders();
        setActiveTab('shopfloor');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to start production.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Complete Production: In Production -> Completed
  const handleCompleteProduction = async (id, prdNumber) => {
    setActionLoadingId(id);
    setToastMsg(null);
    try {
      const res = await productionService.completeProduction(id, { qcStatus: 'Passed' });
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Order ${prdNumber} completed! Materials consumed, Finished Goods credited to Inventory Ledger.`
        });
        await fetchOrders();
        setActiveTab('completed');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to complete production.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const scheduledOrders = orders.filter(o => o.status === 'Scheduled' || o.status === 'Approved' || o.status === 'Material Allocated');
  const inProductionOrders = orders.filter(o => ['In Production', 'In Progress'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'Completed');

  return (
    <div className="space-y-6">
      {/* Site / Warehouse Context Selector */}
      <SiteWarehouseSelector onContextChange={setContext} />



      {/* Toast Feedback */}
      {toastMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between shadow-sm ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 text-sm font-bold">×</button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">READY TO START</span>
          <div className="text-2xl font-black text-blue-600 font-mono">{loading ? '...' : scheduledOrders.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Scheduled Orders</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">SHOP FLOOR ACTIVE</span>
          <div className="text-2xl font-black text-purple-600 font-mono">{loading ? '...' : inProductionOrders.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">In Production</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">COMPLETED</span>
          <div className="text-2xl font-black text-emerald-600 font-mono">{loading ? '...' : completedOrders.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Finished Goods Credited</span>
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
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PRODUCTION ORDERS */}
      {activeTab === 'orders' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>SCHEDULED PRODUCTION ORDERS (READY FOR EXECUTION)</span>
              <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px]">
                {scheduledOrders.length} Ready to Start
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">PO Number</th>
                    <th className="p-4">Linked Batch/Plan</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Target Qty</th>
                    <th className="p-4">Source Warehouse</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {scheduledOrders.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                        No scheduled production orders awaiting execution. Schedule a plan in the <strong>Scheduling</strong> workbench.
                      </td>
                    </tr>
                  ) : (
                    scheduledOrders.map((order) => (
                      <tr key={order._id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono font-bold text-indigo-600">{order.prdNumber}</td>
                        <td className="p-4 font-mono text-slate-500">{order.batchNumber || 'PLAN-001'}</td>
                        <td className="p-4 font-bold text-slate-900">{order.productId?.name || 'Product'}</td>
                        <td className="p-4 font-mono font-bold text-blue-600">{order.targetQuantity}</td>
                        <td className="p-4 text-slate-700">{order.sourceWarehouseId?.name || 'WH-01'}</td>
                        <td className="p-4 text-center">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {order.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === order._id}
                            onClick={() => handleStartProduction(order._id, order.prdNumber)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-1.5 rounded-xl shadow-sm flex items-center space-x-1.5 ml-auto"
                          >
                            <Play className="h-3.5 w-3.5" />
                            <span>Start Production</span>
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

      {/* TAB 2: SHOP FLOOR EXECUTION */}
      {activeTab === 'shopfloor' && (
        <div className="space-y-6">
          {inProductionOrders.length === 0 ? (
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-8 text-center text-slate-400 text-xs">
                No orders currently in active production. Click <strong>Start Production</strong> on a scheduled order.
              </CardContent>
            </Card>
          ) : (
            inProductionOrders.map((order) => (
              <Card key={order._id} className="bg-white border-purple-200 shadow-md overflow-hidden">
                <CardHeader className="bg-purple-50/50 border-b border-purple-100 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-base font-black text-purple-700">{order.prdNumber}</span>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        IN PRODUCTION
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs font-medium text-slate-700">
                      <span>Product: <strong className="text-slate-900">{order.productId?.name}</strong></span>
                      <span>Target Qty: <strong className="text-blue-600 font-mono">{order.targetQuantity}</strong></span>
                      <span>Warehouse: <strong className="text-slate-900">{order.sourceWarehouseId?.name || 'WH-01'}</strong></span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Component Material Consumption Allocation</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs text-slate-700">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="p-3">Material</th>
                            <th className="p-3">Required Qty</th>
                            <th className="p-3">Reserved Qty</th>
                            <th className="p-3">Consumed Qty</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {(order.components || []).map((comp, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 font-sans font-bold text-slate-900">{comp.materialId?.name || 'Raw Component'}</td>
                              <td className="p-3 font-bold text-slate-900">{comp.expectedQuantity || comp.qty || 0}</td>
                              <td className="p-3 font-bold text-blue-600">{comp.expectedQuantity || comp.qty || 0}</td>
                              <td className="p-3 font-bold text-emerald-600">{comp.consumedQuantity || 0}</td>
                              <td className="p-3 text-center font-sans">
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Reserved
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      isLoading={actionLoadingId === order._id}
                      onClick={() => handleCompleteProduction(order._id, order.prdNumber)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2 rounded-xl shadow-md flex items-center space-x-2"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Complete Production & Record Finished Stock</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB 3: COMPLETED ORDERS */}
      {activeTab === 'completed' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>COMPLETED PRODUCTION ORDERS</span>
              <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px]">
                {completedOrders.length} Completed
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">PO Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Target Qty</th>
                    <th className="p-4">Warehouse</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4">Completed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {completedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">No completed production orders.</td>
                    </tr>
                  ) : (
                    completedOrders.map((order) => (
                      <tr key={order._id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono font-bold text-emerald-600">{order.prdNumber}</td>
                        <td className="p-4 font-bold text-slate-900">{order.productId?.name || 'Product'}</td>
                        <td className="p-4 font-mono font-bold text-blue-600">{order.targetQuantity}</td>
                        <td className="p-4 text-slate-700">{order.sourceWarehouseId?.name || 'WH-01'}</td>
                        <td className="p-4 text-center">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Completed
                          </span>
                        </td>
                        <td className="p-4 font-mono text-slate-500">
                          {order.completedDate ? new Date(order.completedDate).toLocaleDateString() : order.updatedAt ? new Date(order.updatedAt).toLocaleDateString() : '—'}
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

export default Manufacturing;
