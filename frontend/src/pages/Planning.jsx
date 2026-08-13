import React, { useState, useEffect } from 'react';
import api from '../services/api';
import productionPlanService from '../services/productionPlanService';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import {
  Cpu, Calculator, AlertTriangle, CheckCircle, Package, ArrowRight, RefreshCw,
  FilePlus, CalendarClock, Play, Undo2, Factory, Clock, ShieldCheck, Copy, Trash2, Zap,
  Layers, CheckCircle2, XCircle, Settings, ArrowLeftRight, Sparkles, ShoppingCart,
  PackageCheck, Network, Layers3, AlertCircle, FileSpreadsheet, CheckSquare
} from 'lucide-react';

const Planning = () => {
  const [activeTab, setActiveTab] = useState('mrp'); // 'mrp', 'plans', 'requisitions', 'explosion'
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [boms, setBoms] = useState([]);
  const [plans, setPlans] = useState([]);
  const [mrpRuns, setMrpRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);

  // Form inputs for MRP Calculation
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedBomId, setSelectedBomId] = useState('');
  const [targetQty, setTargetQty] = useState(100);
  const [requiredDate, setRequiredDate] = useState(new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]);

  // Loading & Feedback States
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State for Manual Production Plan Creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [manualProductId, setManualProductId] = useState('');
  const [manualBomId, setManualBomId] = useState('');
  const [manualWarehouseId, setManualWarehouseId] = useState('');
  const [manualPriority, setManualPriority] = useState('Medium');
  const [plannedQty, setPlannedQty] = useState(100);
  const [manualRequiredDate, setManualRequiredDate] = useState(new Date().toISOString().split('T')[0]);
  const [planNotes, setPlanNotes] = useState('Manual Production Commitment');

  // Modal State for Schedule Plan
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [targetPlanToSchedule, setTargetPlanToSchedule] = useState(null);
  const [scheduleQty, setScheduleQty] = useState(100);
  const [schedulingDirection, setSchedulingDirection] = useState('Forward');
  const [schedulingDate, setSchedulingDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [durationHours, setDurationHours] = useState(6);
  const [resourceGroup, setResourceGroup] = useState('Assembly & Production');
  const [selectedResource, setSelectedResource] = useState('Main Assembly Line 1');
  const [capacityRequired, setCapacityRequired] = useState(6);
  const [capacityAvailable, setCapacityAvailable] = useState(8);
  const [materialReadinessList, setMaterialReadinessList] = useState([]);

  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Load all master data and active records
  const loadMasterData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [whRes, matRes, bomRes, plansRes, runsRes, prRes] = await Promise.all([
        api.get('/api/inventory/warehouses').catch(() => api.get('/api/warehouses')),
        api.get('/api/materials'),
        api.get('/api/boms'),
        productionPlanService.getProductionPlans(),
        api.get('/api/mrp/runs'),
        api.get('/api/requests').catch(() => ({ data: { requests: [] } }))
      ]);

      const whList = whRes.data.data || whRes.data.warehouses || [];
      setWarehouses(whList);
      if (whList.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(whList[0]._id);
        setManualWarehouseId(whList[0]._id);
      }

      const matList = (matRes.data.data || matRes.data.materials || []).filter(m => m.type === 'Finished' || m.type === 'Sub-Assembly' || true);
      setProducts(matList);
      if (matList.length > 0 && !selectedProductId) {
        setSelectedProductId(matList[0]._id);
        setManualProductId(matList[0]._id);
      }

      const bomList = bomRes.data.data || bomRes.data.boms || [];
      setBoms(bomList);
      if (bomList.length > 0 && !selectedBomId) {
        setSelectedBomId(bomList[0]._id);
        setManualBomId(bomList[0]._id);
      }

      setPlans(plansRes.data || plansRes.plans || []);
      const runs = runsRes.data.runs || [];
      setMrpRuns(runs);
      if (runs.length > 0) {
        inspectRun(runs[0]._id);
      }

      setPurchaseRequests(prRes.data.data || prRes.data.requests || []);
    } catch (err) {
      console.error('Failed to load planning data:', err);
      setErrorMsg(err.message || 'Failed to load master planning data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, []);

  const inspectRun = async (runId) => {
    try {
      const res = await api.get(`/api/mrp/runs/${runId}`);
      if (res.data.success) {
        setSelectedRun(res.data.mrpRun);
        setRequirements(res.data.requirements || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Execute MRP Calculation
  const handleCalculateMRP = async (e) => {
    if (e) e.preventDefault();
    if (!selectedProductId || !selectedWarehouseId || !targetQty) {
      setErrorMsg('Please select Product, Warehouse, and enter Target Quantity.');
      return;
    }

    setCalculating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.post('/api/mrp/run', {
        productId: selectedProductId,
        bomId: selectedBomId,
        warehouseId: selectedWarehouseId,
        targetQty: parseFloat(targetQty),
        requiredDate
      });

      if (res.data.success) {
        setSuccessMsg(`✓ MRP Calculation ${res.data.mrpRun.runNumber} completed! Netting calculated across BOM hierarchy.`);
        await loadMasterData();
        if (res.data.mrpRun?._id) {
          inspectRun(res.data.mrpRun._id);
        }
      }
    } catch (err) {
      console.error('MRP Calculation Error:', err);
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to execute MRP calculation');
    } finally {
      setCalculating(false);
    }
  };

  // Convert single requirement
  const handleConvertRequirement = async (reqId, actionType) => {
    try {
      const res = await api.post(`/api/mrp/requirements/${reqId}/convert`, { targetAction: actionType });
      if (res.data.success) {
        setSuccessMsg(`✓ Successfully converted requirement to ${res.data.convertedType}!`);
        await loadMasterData();
        if (selectedRun) inspectRun(selectedRun._id);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message);
    }
  };

  // Bulk convert all shortages in selected run
  const handleBulkConvertShortages = async () => {
    if (!selectedRun) return;
    setActionLoadingId('bulk-convert');
    try {
      const res = await api.post(`/api/mrp/runs/${selectedRun._id}/bulk-convert`);
      if (res.data.success) {
        setSuccessMsg(`✓ Released All Shortages! Created ${res.data.count} automated Purchase Requests & Production Plans.`);
        await loadMasterData();
        inspectRun(selectedRun._id);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Create Manual Production Plan
  const handleConfirmCreatePlan = async () => {
    if (!plannedQty || plannedQty <= 0) return;
    setActionLoadingId('create-plan');
    setErrorMsg('');

    try {
      const res = await productionPlanService.createProductionPlan({
        productId: manualProductId || selectedProductId,
        bomId: manualBomId || selectedBomId,
        warehouseId: manualWarehouseId || selectedWarehouseId,
        quantity: parseFloat(plannedQty),
        priority: manualPriority,
        requiredDate: manualRequiredDate || requiredDate,
        status: 'Unscheduled',
        notes: planNotes
      });

      if (res.success || res.data) {
        setSuccessMsg(`✓ Production Plan created successfully in UNSCHEDULED state!`);
        setIsCreateModalOpen(false);
        await loadMasterData();
        setActiveTab('plans');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to create Production Plan.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Schedule Plan
  const handleConfirmSchedulePlan = async () => {
    if (!targetPlanToSchedule) return;
    setSubmittingSchedule(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const hasShortage = materialReadinessList.some(m => (m.shortageQty || 0) > 0);
      const res = await productionPlanService.schedulePlan(targetPlanToSchedule._id, {
        quantity: parseFloat(scheduleQty),
        direction: schedulingDirection,
        schedulingDate,
        startTime,
        durationHours,
        resourceGroup,
        workCenter: selectedResource,
        capacityRequired,
        capacityAvailable,
        materialCheckStatus: hasShortage ? 'Shortage' : 'Ready',
        capacityCheckStatus: capacityRequired <= capacityAvailable ? 'Sufficient' : 'Overcapacity',
        startDate: schedulingDate,
        endDate: new Date(new Date(schedulingDate).getTime() + (durationHours * 3600000)).toISOString().split('T')[0]
      });

      if (res.success || res.data) {
        setSuccessMsg(`✓ Plan ${targetPlanToSchedule.planNumber} scheduled! Production Order created and materials soft-reserved.`);
        setIsScheduleModalOpen(false);
        await loadMasterData();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to schedule Production Plan.');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const selectedProductObj = products.find(p => p._id === selectedProductId);
  const selectedWarehouseObj = warehouses.find(w => w._id === selectedWarehouseId);
  const selectedBomObj = boms.find(b => (b.productId?._id || b.productId) === selectedProductId || b._id === selectedBomId);

  const pendingShortageCount = requirements.filter(r => r.shortageQty > 0 && r.status === 'Pending').length;

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* EXECUTIVE HEADER */}
      <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white rounded-md flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> Enterprise MRP Engine & Supply Chain Planning
              </span>
              <span className="text-xs text-slate-500 font-medium">● Deterministic Netting & Capacity Allocation</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Material Requirements Planning & Schedule Workbench</h1>
            <p className="text-xs text-slate-500 font-normal">
              Explode multi-level BOM recipes, calculate inventory net shortages, and automate procurement requisitions to production orders.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <FilePlus className="h-4 w-4" />
              <span>+ Create Production Plan</span>
            </button>

            <button
              onClick={loadMasterData}
              className="p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-lg shadow-2xs transition-colors"
              title="Refresh Engine Data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* FEEDBACK TOASTS */}
      {errorMsg && (
        <div className="flex items-center justify-between p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-900 font-extrabold underline">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-900 font-extrabold underline">Dismiss</button>
        </div>
      )}

      {/* KPI METRIC TILES */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">MRP Runs Executed</span>
          <p className="text-2xl font-black text-slate-900">{mrpRuns.length}</p>
          <p className="text-[11px] text-slate-500 font-medium">Historical Runs Logged</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-amber-700 tracking-wider">Active Shortage Alerts</span>
          <p className="text-2xl font-black text-amber-600">{pendingShortageCount}</p>
          <p className="text-[11px] text-slate-500 font-medium">Require Purchase / Produce Release</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-blue-700 tracking-wider">Committed Plans</span>
          <p className="text-2xl font-black text-blue-600">{plans.length}</p>
          <p className="text-[11px] text-slate-500 font-medium">Production Proposals Active</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">Purchase Requisitions</span>
          <p className="text-2xl font-black text-emerald-600">{purchaseRequests.length}</p>
          <p className="text-[11px] text-slate-500 font-medium">Auto-Dispatched Procurement</p>
        </div>
      </div>

      {/* WORKBENCH TAB NAVIGATION */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 overflow-x-auto">
        {[
          ['mrp', 'MRP Netting Engine', Calculator],
          ['plans', `Schedule Plans (${plans.length})`, CalendarClock],
          ['requisitions', `Purchase Requisitions (${purchaseRequests.length})`, ShoppingCart],
          ['explosion', 'BOM Tree Visualizer', Layers3]
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 font-extrabold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: MRP ENGINE & NETTING CALCULATION */}
      {activeTab === 'mrp' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-b-xl border border-slate-200 border-t-0 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-blue-600" /> Execute Deterministic MRP Calculation Run
              </h3>
              <p className="text-xs text-slate-500 font-normal">Select finished product, target warehouse, and demand quantity to perform multi-level BOM explosion and netting.</p>
            </div>

            <form onSubmit={handleCalculateMRP} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-medium">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Product *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 font-bold text-slate-900 shadow-2xs outline-none focus:border-blue-500"
                  required
                >
                  {products.map(p => (
                    <option key={p._id} value={p._id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Warehouse *</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 font-bold text-slate-900 shadow-2xs outline-none focus:border-blue-500"
                  required
                >
                  {warehouses.map(w => (
                    <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Required Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={targetQty}
                  onChange={(e) => setTargetQty(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Required Date *</label>
                <input
                  type="date"
                  value={requiredDate}
                  onChange={(e) => setRequiredDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="md:col-span-4 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={calculating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-2"
                >
                  <Play className={`h-4 w-4 ${calculating ? 'animate-spin' : ''}`} />
                  <span>{calculating ? 'Calculating Explosion...' : 'Run MRP Netting Calculation'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* MRP RUN RESULTS & MULTI-LEVEL NETTING TABLE */}
          <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
            {/* HISTORICAL MRP RUNS SIDEBAR */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-slate-900 tracking-wider flex items-center justify-between">
                <span>Recent Executions</span>
                <span className="text-[10px] text-blue-600 font-mono">{mrpRuns.length}</span>
              </h4>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {mrpRuns.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 text-center bg-slate-50 rounded-lg">No runs logged yet.</p>
                ) : (
                  mrpRuns.map((r) => (
                    <div
                      key={r._id}
                      onClick={() => inspectRun(r._id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all space-y-1 ${
                        selectedRun && selectedRun._id === r._id ? 'border-blue-500 bg-blue-50/50 shadow-2xs' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between font-extrabold text-slate-900">
                        <span className="font-mono text-blue-600">{r.runNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${r.summary?.hasShortage ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {r.summary?.hasShortage ? 'Shortage' : 'Balanced'}
                        </span>
                      </div>
                      <p className="text-slate-700 font-bold truncate">{r.productId?.name || 'Assembly Product'}</p>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                        <span>Target: {r.targetQty} pcs</span>
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SELECTED RUN DETAILS */}
            <div className="space-y-4">
              {selectedRun ? (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-blue-600">{selectedRun.runNumber}</span>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        {selectedRun.productId?.name} — Multi-Level BOM Netting Calculation
                      </h3>
                      <p className="text-xs text-slate-500 font-normal">
                        Warehouse: {selectedRun.warehouseId?.name} • Target Quantity: <strong>{selectedRun.targetQty} units</strong>
                      </p>
                    </div>

                    {pendingShortageCount > 0 && (
                      <button
                        onClick={handleBulkConvertShortages}
                        disabled={actionLoadingId === 'bulk-convert'}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
                      >
                        <Zap className="h-4 w-4" />
                        <span>Release All Shortages ({pendingShortageCount})</span>
                      </button>
                    )}
                  </div>

                  {/* AI RATIONALE BOX */}
                  {selectedRun.summary?.aiExplanation && (
                    <div className="p-3 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-xl flex items-start gap-3 text-xs shadow-xs">
                      <Sparkles className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-indigo-300 uppercase tracking-wider text-[10px]">AI Executive Bottleneck Commentary</p>
                        <p className="text-slate-200 mt-0.5 leading-relaxed">{selectedRun.summary.aiExplanation}</p>
                      </div>
                    </div>
                  )}

                  {/* REQUIREMENTS NETTING TABLE */}
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-3">BOM Level</th>
                          <th className="p-3">Component Material</th>
                          <th className="p-3 text-right">Gross Req</th>
                          <th className="p-3 text-right">Available Stock</th>
                          <th className="p-3 text-right">Open PO Supplies</th>
                          <th className="p-3 text-right">Net Shortage</th>
                          <th className="p-3 text-center">Action Plan</th>
                          <th className="p-3 text-center">Convert Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                        {requirements.map((req) => {
                          const isShortage = req.shortageQty > 0;
                          return (
                            <tr key={req._id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded font-mono font-bold text-[10px]">
                                  L{req.bomLevel || 1}
                                </span>
                              </td>
                              <td className="p-3">
                                <p className="font-extrabold text-slate-900">{req.materialName}</p>
                                <span className="text-[10px] text-slate-400 font-mono">{req.materialCode}</span>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">{req.requiredQty} {req.unit}</td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-600">{req.availableQty} {req.unit}</td>
                              <td className="p-3 text-right font-mono font-bold text-blue-600">{req.onOrderQty || 0} {req.unit}</td>
                              <td className={`p-3 text-right font-mono font-extrabold ${isShortage ? 'text-rose-600' : 'text-slate-400'}`}>
                                {req.shortageQty} {req.unit}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  isShortage ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {req.action}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {req.status !== 'Pending' ? (
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{req.status}</span>
                                ) : isShortage ? (
                                  <button
                                    onClick={() => handleConvertRequirement(req._id, req.action === 'Produce' ? 'ProductionPlan' : 'PurchaseRequest')}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-[10px] rounded-md shadow-2xs flex items-center gap-1 mx-auto"
                                  >
                                    {req.action === 'Produce' ? <PackageCheck className="h-3 w-3 text-blue-600" /> : <ShoppingCart className="h-3 w-3 text-amber-600" />}
                                    <span>Create {req.action === 'Produce' ? 'Plan' : 'PR'}</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-extrabold">✓ Ready</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-xs italic">
                  Select or execute an MRP run above to inspect netting calculation.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTION SCHEDULE PLANS WORKBENCH */}
      {activeTab === 'plans' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Master Production Schedule (MPS Proposals)</h3>
              <p className="text-xs text-slate-500 font-normal">Review production plan commitments, schedule capacity on assembly lines, and generate work orders.</p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1"
            >
              <FilePlus className="h-4 w-4" /> + Create Plan
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Plan Code</th>
                  <th className="p-3">Target Product</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Target Warehouse</th>
                  <th className="p-3 text-right">Target Qty</th>
                  <th className="p-3 text-right">Scheduled Qty</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                {plans.length === 0 ? (
                  <tr><td colSpan="8" className="p-8 text-center text-slate-400 italic">No production plans active. Click "+ Create Plan" or run MRP calculation.</td></tr>
                ) : (
                  plans.map((plan) => {
                    const isScheduled = plan.status === 'Scheduled' || plan.status === 'Partially Scheduled';
                    return (
                      <tr key={plan._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-extrabold text-blue-600">{plan.planNumber}</td>
                        <td className="p-3 font-bold text-slate-900">{plan.productId?.name || 'Finished Good'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            plan.priority === 'High' || plan.priority === 'Critical' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {plan.priority || 'Medium'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 font-semibold">{plan.warehouseId?.name || 'Main Warehouse'}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{plan.quantity}</td>
                        <td className="p-3 text-right font-mono font-bold text-blue-600">{plan.scheduledQuantity || 0}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold ${
                            isScheduled ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {isScheduled ? (
                              <button
                                onClick={() => handleUnschedulePlan(plan)}
                                className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[10px] rounded-lg shadow-2xs"
                              >
                                Unschedule
                              </button>
                            ) : (
                              <button
                                onClick={() => { setTargetPlanToSchedule(plan); setIsScheduleModalOpen(true); }}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg shadow-2xs"
                              >
                                Schedule Capacity
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUTO-GENERATED PURCHASE REQUISITIONS */}
      {activeTab === 'requisitions' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Auto-Dispatched Procurement Requisitions (Purchase Requests)</h3>
              <p className="text-xs text-slate-500 font-normal">Requisitions automatically created from MRP shortage calculations awaiting PO release.</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Request Title / Code</th>
                  <th className="p-3">Material Name</th>
                  <th className="p-3 text-right">Requested Qty</th>
                  <th className="p-3 text-right">Estimated Amount</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Creation Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                {purchaseRequests.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-400 italic">No purchase requisitions recorded. Execute MRP calculation to release material shortages.</td></tr>
                ) : (
                  purchaseRequests.map((pr) => (
                    <tr key={pr._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3">
                        <p className="font-extrabold text-slate-900">{pr.title || pr.requestNumber}</p>
                        <span className="text-[10px] text-slate-400 font-mono">{pr.requestNumber}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-800">{pr.materialId?.name || 'Raw Material Component'}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{pr.quantity || 1} pcs</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">₹{(pr.amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                          {pr.status || 'Pending'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">
                          MRP Engine Auto
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: BOM EXPLOSION TREE VISUALIZER */}
      {activeTab === 'explosion' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Multi-Level BOM Hierarchy Visualizer</h3>
              <p className="text-xs text-slate-500 font-normal">Inspect how finished products break down into sub-assemblies and raw component materials.</p>
            </div>

            <select
              value={selectedBomId}
              onChange={(e) => setSelectedBomId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white p-2 font-bold text-xs text-slate-900 shadow-2xs outline-none"
            >
              {boms.map(b => (
                <option key={b._id} value={b._id}>{b.name || b.bomNumber || 'BOM Recipe'}</option>
              ))}
            </select>
          </div>

          {selectedBomObj ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm border-b border-slate-200 pb-2">
                <Package className="h-5 w-5 text-blue-600" />
                <span>Finished Product: {selectedBomObj.productId?.name || selectedBomObj.name} ({selectedBomObj.bomNumber})</span>
              </div>

              <div className="pl-4 space-y-2">
                <span className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">Level 1 Components ({selectedBomObj.components?.length || 0})</span>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(selectedBomObj.components || []).map((c, i) => (
                    <div key={i} className="p-3 bg-white border border-slate-200 rounded-lg space-y-1 shadow-2xs">
                      <div className="flex justify-between items-start">
                        <p className="font-extrabold text-xs text-slate-900">{c.materialId?.name || 'Component'}</p>
                        <span className="text-[10px] font-mono text-blue-600 font-bold">Qty: {c.quantity} {c.uom || 'pcs'}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium">Scrap / Loss: {c.lossPercentage || 0}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs italic">Select a BOM recipe above to visualize component explosion.</div>
          )}
        </div>
      )}

      {/* Modal: CREATE MANUAL PRODUCTION PLAN */}
      {isCreateModalOpen && (
        <Dialog isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Production Plan Commitment">
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Finished Product *</label>
              <select value={manualProductId} onChange={(e) => setManualProductId(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs">
                {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Target Warehouse *</label>
              <select value={manualWarehouseId} onChange={(e) => setManualWarehouseId(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs">
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name} ({w.code})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Quantity *</label>
                <input type="number" min="1" value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Required Date *</label>
                <input type="date" value={manualRequiredDate} onChange={(e) => setManualRequiredDate(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Cancel</button>
              <button type="button" onClick={handleConfirmCreatePlan} className="rounded-lg bg-blue-600 px-4 py-1.5 font-bold text-white shadow-2xs">Commit Production Plan</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal: SCHEDULE CAPACITY PLAN */}
      {isScheduleModalOpen && targetPlanToSchedule && (
        <Dialog isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} title={`Schedule Capacity: ${targetPlanToSchedule.planNumber}`}>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Work Center / Assembly Line *</label>
              <select value={selectedResource} onChange={(e) => setSelectedResource(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs">
                <option value="Main Assembly Line 1">Main Assembly Line 1</option>
                <option value="SMT Electronics Line 2">SMT Electronics Line 2</option>
                <option value="CNC Machining Cell 3">CNC Machining Cell 3</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Start Time *</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Duration (Hours) *</label>
                <input type="number" min="1" value={durationHours} onChange={(e) => setDurationHours(parseFloat(e.target.value))} className="w-full rounded-lg border border-slate-300 p-2 font-bold text-slate-900 shadow-2xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Cancel</button>
              <button type="button" onClick={handleConfirmSchedulePlan} className="rounded-lg bg-emerald-600 px-4 py-1.5 font-bold text-white shadow-2xs">Confirm & Issue Work Order</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default Planning;
