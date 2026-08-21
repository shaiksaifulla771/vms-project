import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import productionService from '../services/productionService';
import { useSiteContext } from '../context/SiteContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Factory, Play, CheckCircle, AlertTriangle, RefreshCw,
  Package, Clock, CheckCircle2, XCircle, Plus, X, Layers,
  Warehouse as WarehouseIcon, FileText, ArrowRight, ShieldCheck
} from 'lucide-react';

const TABS = [
  { id: 'orders', label: '1. Production Orders (Ready)', icon: Clock },
  { id: 'shopfloor', label: '2. Shop Floor Execution (Active)', icon: Factory },
  { id: 'completed', label: '3. Completed Production (Stocked)', icon: CheckCircle },
];

const DEFAULT_OPERATIONAL_STAGES = [
  { seq: 1, name: 'Material Staging & Kitting', resource: 'Warehouse Staging Bay', color: 'bg-amber-500' },
  { seq: 2, name: 'Preparation & Weighing', resource: 'Prep Workstation 1', color: 'bg-blue-500' },
  { seq: 3, name: 'Core Manufacturing / Assembly', resource: 'Main Processing Line', color: 'bg-indigo-500' },
  { seq: 4, name: 'In-line Quality Inspection (QC)', resource: 'QC Testing Station', color: 'bg-purple-500' },
  { seq: 5, name: 'High-Speed Packaging & Labeling', resource: 'Packaging Conveyor 2', color: 'bg-pink-500' },
  { seq: 6, name: 'Final QA & Warehouse Putaway', resource: 'Finished Goods Dock', color: 'bg-emerald-500' },
];

const Manufacturing = () => {
  const { activeSiteId, activeWarehouseId } = useSiteContext();
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Direct Production Order Modal State
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [submittingDirectOrder, setSubmittingDirectOrder] = useState(false);
  const [directForm, setDirectForm] = useState({
    productId: '',
    bomId: '',
    targetQuantity: 50,
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    notes: '',
  });

  // Fetch production orders and support data
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const [ordersRes, matRes, bomRes, whRes] = await Promise.all([
        productionService.getProductionOrders(query).catch(err => ({ data: [] })),
        api.get('/api/materials').catch(err => ({ data: { data: [] } })),
        api.get('/api/boms').catch(err => ({ data: { data: [] } })),
        api.get('/api/warehouses').catch(err => ({ data: { data: [] } }))
      ]);

      const fetchedOrders = ordersRes.data || ordersRes.orders || (Array.isArray(ordersRes) ? ordersRes : []);
      setOrders(fetchedOrders);

      const allMats = matRes.data?.data || matRes.data?.materials || (Array.isArray(matRes.data) ? matRes.data : []);
      const finishedMats = allMats.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE');
      setMaterials(finishedMats.length > 0 ? finishedMats : allMats);

      const allBoms = bomRes.data?.data || bomRes.data?.boms || (Array.isArray(bomRes.data) ? bomRes.data : []);
      setBoms(allBoms);

      const allWhs = whRes.data?.warehouses || whRes.data?.data || (Array.isArray(whRes.data) ? whRes.data : []);
      setWarehouses(allWhs);

      // Set default warehouse if available
      if (allWhs.length > 0 && !directForm.sourceWarehouseId) {
        setDirectForm(prev => ({
          ...prev,
          sourceWarehouseId: allWhs[0]._id,
          destinationWarehouseId: allWhs[0]._id
        }));
      }
    } catch (err) {
      console.error('Failed to fetch production records:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle Start Production: Scheduled / Draft / Released -> In Production
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
      setToastMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to start production.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Complete Production: In Production -> Completed (Updates inventory & ledger)
  const handleCompleteProduction = async (id, prdNumber) => {
    setActionLoadingId(id);
    setToastMsg(null);
    try {
      const res = await productionService.completeProduction(id, { qcStatus: 'Passed' });
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Order ${prdNumber} completed! Materials consumed and Finished Goods credited to Inventory Ledger.`
        });
        await fetchOrders();
        setActiveTab('completed');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to complete production.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Create Direct Production Order
  const handleCreateDirectOrder = async (e) => {
    e.preventDefault();
    if (!directForm.productId || !directForm.bomId) {
      setToastMsg({ type: 'error', text: 'Please select a finished product and active BOM recipe.' });
      return;
    }

    setSubmittingDirectOrder(true);
    setToastMsg(null);
    try {
      const payload = {
        productId: directForm.productId,
        bomId: directForm.bomId,
        targetQuantity: Number(directForm.targetQuantity) || 1,
        sourceWarehouseId: directForm.sourceWarehouseId || warehouses[0]?._id,
        destinationWarehouseId: directForm.destinationWarehouseId || directForm.sourceWarehouseId || warehouses[0]?._id,
        status: 'Scheduled',
        notes: directForm.notes || 'Direct shop-floor production order'
      };

      const res = await api.post('/api/productions', payload);
      if (res.data?.success || res.data?.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Production Order ${res.data.data?.prdNumber || ''} created successfully!`
        });
        setIsDirectModalOpen(false);
        await fetchOrders();
        setActiveTab('orders');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to create production order.' });
    } finally {
      setSubmittingDirectOrder(false);
    }
  };

  // Filter categories cleanly
  const scheduledOrders = useMemo(() => {
    return orders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return ['SCHEDULED', 'APPROVED', 'MATERIAL ALLOCATED', 'DRAFT', 'PENDING APPROVAL', 'PLANNED', 'RELEASED', 'READY', 'UNSCHEDULED'].includes(s);
    });
  }, [orders]);

  const inProductionOrders = useMemo(() => {
    return orders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return ['IN PRODUCTION', 'IN PROGRESS', 'IN_PROGRESS', 'QUALITY CHECK', 'QC', 'RUNNING'].includes(s);
    });
  }, [orders]);

  const completedOrders = useMemo(() => {
    return orders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return ['COMPLETED', 'PASSED'].includes(s);
    });
  }, [orders]);

  return (
    <div className="space-y-6 max-w-full font-sans text-slate-900 pb-16">
      {/* Toast Feedback */}
      {toastMsg && (
        <div className={`p-4 rounded-2xl text-xs font-bold border flex items-center justify-between shadow-sm animate-in fade-in ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center space-x-2.5">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-700 text-base font-bold px-1.5">×</button>
        </div>
      )}

      {/* Header bar */}
      <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white rounded-md flex items-center gap-1">
              <Factory className="h-3 w-3 text-purple-400" /> Shop Floor Production
            </span>
            <span className="text-xs text-slate-500 font-semibold">
              ● {orders.length} Total Orders Recorded
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
            Production &amp; Shop Floor Execution
          </h1>
          <p className="text-xs text-slate-500">
            Real-time execution of released MRP plans, component reservation, and finished goods stock ledger receipt.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            size="sm"
            onClick={fetchOrders}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => {
              const defaultProd = materials[0]?._id || '';
              const matchingBom = boms.find(b => (b.productId?._id || b.productId) === defaultProd);
              setDirectForm({
                productId: defaultProd,
                bomId: matchingBom ? matchingBom._id : (boms[0]?._id || ''),
                targetQuantity: 50,
                sourceWarehouseId: warehouses[0]?._id || '',
                destinationWarehouseId: warehouses[0]?._id || '',
                notes: ''
              });
              setIsDirectModalOpen(true);
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            + Direct Production Order
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div 
          onClick={() => setActiveTab('orders')}
          className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all shadow-sm space-y-1 ${
            activeTab === 'orders' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">STAGE 1: READY TO START</span>
          <div className="text-3xl font-black text-blue-600 font-mono">{loading ? '...' : scheduledOrders.length}</div>
          <span className="text-[11px] text-slate-500 block font-medium">Scheduled &amp; Released Orders</span>
        </div>

        <div 
          onClick={() => setActiveTab('shopfloor')}
          className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all shadow-sm space-y-1 ${
            activeTab === 'shopfloor' ? 'border-purple-500 ring-2 ring-purple-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">STAGE 2: SHOP FLOOR ACTIVE</span>
          <div className="text-3xl font-black text-purple-600 font-mono">{loading ? '...' : inProductionOrders.length}</div>
          <span className="text-[11px] text-slate-500 block font-medium">In Production on Assembly Lines</span>
        </div>

        <div 
          onClick={() => setActiveTab('completed')}
          className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all shadow-sm space-y-1 ${
            activeTab === 'completed' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">STAGE 3: COMPLETED &amp; STOCKED</span>
          <div className="text-3xl font-black text-emerald-600 font-mono">{loading ? '...' : completedOrders.length}</div>
          <span className="text-[11px] text-slate-500 block font-medium">Finished Goods Credited to Ledger</span>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-3 pt-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-5 py-3 text-xs font-black transition-all border-b-2 -mb-px ${
                isActive
                  ? 'border-purple-600 text-purple-700 bg-purple-50/40 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PRODUCTION ORDERS */}
      {activeTab === 'orders' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-b-3xl rounded-t-none overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-5">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>SCHEDULED PRODUCTION ORDERS (READY FOR SHOP FLOOR EXECUTION)</span>
              <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px] font-extrabold">
                {scheduledOrders.length} Orders Awaiting Execution
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[780px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">PO Number</th>
                    <th className="p-4 whitespace-nowrap">Plan Reference</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Target Qty</th>
                    <th className="p-4 whitespace-nowrap">Warehouse</th>
                    <th className="p-4 text-center whitespace-nowrap">Status</th>
                    <th className="p-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {scheduledOrders.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-12 text-center text-slate-400 text-xs">
                        <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        No scheduled production orders awaiting execution.<br />
                        Release a plan from <strong>MRP &amp; Planning</strong> or click <strong>+ Direct Production Order</strong> above.
                      </td>
                    </tr>
                  ) : (
                    scheduledOrders.map((order) => (
                      <tr key={order._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-mono font-extrabold text-purple-700 whitespace-nowrap">{order.prdNumber}</td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                          {order.planId?.planNumber || order.sourcePlanId?.planNumber || order.batchNumber || 'Direct Order'}
                        </td>
                        <td className="p-4">
                          <p className="font-extrabold text-slate-900">{order.productId?.name || order.productName || 'Product'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{order.productId?.code}</p>
                        </td>
                        <td className="p-4 text-right font-mono font-black text-blue-700 whitespace-nowrap">
                          {order.targetQuantity || order.quantity || 0} <span className="text-[10px] font-normal text-slate-500">{order.productId?.unit || 'pcs'}</span>
                        </td>
                        <td className="p-4 text-slate-700 whitespace-nowrap">
                          {order.sourceWarehouseId?.name || order.warehouseId?.name || 'Central Warehouse'}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                            {order.status || 'Scheduled'}
                          </span>
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === order._id}
                            onClick={() => handleStartProduction(order._id, order.prdNumber)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-sm flex items-center space-x-1.5 ml-auto"
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
            <Card className="bg-white border-slate-200 shadow-sm rounded-3xl">
              <CardContent className="p-12 text-center text-slate-400 text-xs">
                <Factory className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No orders currently active on the shop floor.<br />
                Click <strong>Start Production</strong> on any scheduled order in Tab 1 to begin assembly.
              </CardContent>
            </Card>
          ) : (
            inProductionOrders.map((order) => (
              <Card key={order._id} className="bg-white border-purple-200 shadow-md rounded-3xl overflow-hidden animate-in fade-in">
                <CardHeader className="bg-purple-50/60 border-b border-purple-100 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-base font-black text-purple-900">{order.prdNumber}</span>
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white shadow-sm flex items-center gap-1.5">
                        <Factory className="h-3 w-3" /> ACTIVE ON SHOP FLOOR
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs font-semibold text-slate-700">
                      <span>Product: <strong className="text-slate-900">{order.productId?.name || 'Product'}</strong></span>
                      <span>Target: <strong className="text-blue-600 font-mono">{order.targetQuantity} {order.productId?.unit || 'pcs'}</strong></span>
                      <span>Warehouse: <strong className="text-slate-900">{order.sourceWarehouseId?.name || 'Central'}</strong></span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* 6 STAGES PREVIEW BANNER */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-black text-slate-800 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-purple-600" />
                        Operational Manufacturing Routing
                      </span>
                      <span className="text-purple-600 font-mono">Stage 3: Core Assembly in Progress</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 text-[10px]">
                      {DEFAULT_OPERATIONAL_STAGES.map((s) => (
                        <div key={s.seq} className="p-2 bg-white rounded-xl border border-slate-200 flex items-center gap-2 shadow-xs">
                          <span className={`w-2 h-2 rounded-full ${s.color}`}></span>
                          <span className="font-bold text-slate-700 truncate">{s.seq}. {s.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Material Consumption Table */}
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-purple-600" />
                      Component Materials Reserved for Consumption
                    </h4>
                    <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-xs text-slate-700 min-w-[650px]">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="p-3.5">Material Name &amp; Code</th>
                            <th className="p-3.5 text-right">Required Qty</th>
                            <th className="p-3.5 text-right">Reserved Stock</th>
                            <th className="p-3.5 text-right">Consumed Qty</th>
                            <th className="p-3.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {(order.components || []).length === 0 ? (
                            <tr>
                              <td colSpan="5" className="p-4 text-center text-slate-400 text-xs font-sans">
                                Standard recipe components linked to BOM.
                              </td>
                            </tr>
                          ) : (
                            order.components.map((comp, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3.5 font-sans font-bold text-slate-900">
                                  {comp.materialId?.name || comp.materialName || 'Raw Material Component'}
                                  <span className="block text-[10px] font-mono text-slate-400">{comp.materialId?.code}</span>
                                </td>
                                <td className="p-3.5 text-right font-bold text-slate-900">{comp.expectedQuantity || comp.qty || 0}</td>
                                <td className="p-3.5 text-right font-bold text-blue-600">{comp.expectedQuantity || comp.qty || 0}</td>
                                <td className="p-3.5 text-right font-bold text-emerald-600">{comp.consumedQuantity || 0}</td>
                                <td className="p-3.5 text-center font-sans">
                                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    Reserved
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                    <Button
                      size="sm"
                      isLoading={actionLoadingId === order._id}
                      onClick={() => handleCompleteProduction(order._id, order.prdNumber)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-6 py-2.5 rounded-xl shadow-md flex items-center space-x-2"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Complete Production &amp; Record Finished Stock</span>
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
        <Card className="bg-white border-slate-200 shadow-sm rounded-b-3xl rounded-t-none overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-5">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>COMPLETED PRODUCTION ORDERS (QC PASSED &amp; LEDGER CREDITED)</span>
              <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px] font-extrabold">
                {completedOrders.length} Completed Records
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">PO Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Produced Qty</th>
                    <th className="p-4 whitespace-nowrap">Destination Warehouse</th>
                    <th className="p-4 text-center whitespace-nowrap">QC Status</th>
                    <th className="p-4 whitespace-nowrap">Completion Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {completedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-12 text-center text-slate-400 text-xs">
                        No completed production records yet.
                      </td>
                    </tr>
                  ) : (
                    completedOrders.map((order) => (
                      <tr key={order._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-mono font-extrabold text-emerald-700 whitespace-nowrap">{order.prdNumber}</td>
                        <td className="p-4">
                          <p className="font-extrabold text-slate-900">{order.productId?.name || 'Product'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{order.productId?.code}</p>
                        </td>
                        <td className="p-4 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                          {order.actualQuantity || order.targetQuantity || 0} <span className="text-[10px] font-normal text-slate-500">{order.productId?.unit || 'pcs'}</span>
                        </td>
                        <td className="p-4 text-slate-700 whitespace-nowrap">
                          {order.destinationWarehouseId?.name || order.sourceWarehouseId?.name || 'Central Warehouse'}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="px-3 py-1 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Passed &amp; Credited
                          </span>
                        </td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
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

      {/* ========================================================================= */}
      {/* DIRECT PRODUCTION ORDER MODAL                                            */}
      {/* ========================================================================= */}
      {isDirectModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Factory className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Create Direct Production Order</h3>
                  <p className="text-xs text-slate-500">Initiate a shop-floor job directly on assembly line</p>
                </div>
              </div>
              <button onClick={() => setIsDirectModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateDirectOrder} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">Finished Product *</label>
                <select
                  value={directForm.productId}
                  onChange={(e) => {
                    const prodId = e.target.value;
                    const matchingBom = boms.find(b => (b.productId?._id || b.productId) === prodId || (b.product?._id || b.product) === prodId);
                    setDirectForm(prev => ({
                      ...prev,
                      productId: prodId,
                      bomId: matchingBom ? matchingBom._id : prev.bomId
                    }));
                  }}
                  required
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Select Product --</option>
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">BOM Recipe *</label>
                <select
                  value={directForm.bomId}
                  onChange={(e) => setDirectForm(prev => ({ ...prev, bomId: e.target.value }))}
                  required
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Select BOM Recipe --</option>
                  {boms.map(b => (
                    <option key={b._id} value={b._id}>{b.bomNumber} (v{b.version || 1})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">Target Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={directForm.targetQuantity}
                    onChange={(e) => setDirectForm(prev => ({ ...prev, targetQuantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    required
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-mono font-black"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">Warehouse *</label>
                  <select
                    value={directForm.sourceWarehouseId}
                    onChange={(e) => setDirectForm(prev => ({ ...prev, sourceWarehouseId: e.target.value, destinationWarehouseId: e.target.value }))}
                    required
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold"
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  value={directForm.notes}
                  onChange={(e) => setDirectForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Rush priority batch"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsDirectModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={submittingDirectOrder}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl px-5"
                >
                  Create Production Order
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Manufacturing;
