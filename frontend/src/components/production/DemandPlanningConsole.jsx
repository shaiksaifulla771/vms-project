import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
  Calculator,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Calendar,
  Building2,
  FileSpreadsheet,
  Package,
  TrendingDown,
  TrendingUp,
  Download,
  ShieldAlert,
  ArrowRight,
  PlusCircle,
  Clock,
  ChevronRight,
  Sparkles,
  Sliders
} from 'lucide-react';
import * as XLSX from 'xlsx';
import BatchExecutionModal from './BatchExecutionModal';

export default function DemandPlanningConsole({
  materials = [],
  sites = [],
  warehouses = [],
  boms = [],
  onPlanCreated,
  activeSiteId = '',
  activeWarehouseId = ''
}) {
  // Input State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [demandQty, setDemandQty] = useState(4000);
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || '');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(activeWarehouseId || '');

  // Simulation Results State
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Plan creation / Batch execution modal states
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [isBatchExecModalOpen, setIsBatchExecModalOpen] = useState(false);
  const [batchExecInitialPlan, setBatchExecInitialPlan] = useState(null);

  // Filter finished goods / make materials
  const finishedGoods = React.useMemo(() => {
    const fg = materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE');
    return fg.length > 0 ? fg : materials;
  }, [materials]);

  // Set default product when materials load
  useEffect(() => {
    if (!selectedProductId && finishedGoods.length > 0) {
      setSelectedProductId(finishedGoods[0]._id);
    }
  }, [finishedGoods, selectedProductId]);

  // Sync active site from parent
  useEffect(() => {
    if (activeSiteId && !selectedSiteId) {
      setSelectedSiteId(activeSiteId);
    }
  }, [activeSiteId, selectedSiteId]);

  // Auto-set default warehouse when site changes
  const handleSiteChange = (sId) => {
    setSelectedSiteId(sId);
    if (!sId || sId === 'ALL') {
      setSelectedWarehouseId('');
      return;
    }
    const siteObj = sites.find(s => s._id === sId);
    const defWh = siteObj?.defaultWarehouse?._id ||
      warehouses.find(w => (w.siteId?._id || w.siteId) === sId && w.isDefault)?._id ||
      warehouses.find(w => (w.siteId?._id || w.siteId) === sId)?._id || '';
    setSelectedWarehouseId(defWh);
  };

  // Run Demand Planning Simulation
  const handleRunSimulation = useCallback(async () => {
    if (!selectedProductId) {
      setErrorMsg('Please select a finished goods product.');
      return;
    }
    if (!demandQty || Number(demandQty) <= 0) {
      setErrorMsg('Please enter a valid demand quantity greater than 0.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        productId: selectedProductId,
        demandQty: Number(demandQty),
        siteId: selectedSiteId && selectedSiteId !== 'ALL' ? selectedSiteId : undefined,
        warehouseId: selectedWarehouseId && selectedWarehouseId !== 'ALL' ? selectedWarehouseId : undefined
      };

      const res = await api.post('/production-plans/simulate', payload);
      if (res.data?.success) {
        setSimulationData(res.data.data);
      } else {
        setErrorMsg(res.data?.error || 'Simulation returned no data');
      }
    } catch (err) {
      console.error('Simulation error:', err);
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to simulate demand planning');
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, demandQty, selectedSiteId, selectedWarehouseId]);

  // Automatically run simulation on first load once product is set
  useEffect(() => {
    if (selectedProductId && !simulationData && !loading) {
      handleRunSimulation();
    }
  }, [selectedProductId, handleRunSimulation, simulationData, loading]);

  // Convert Simulation to Official Production Plan
  const handleCreatePlanFromSimulation = async () => {
    if (!simulationData || !simulationData.planSummary?.[0]) return;
    setCreatingPlan(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const planSum = simulationData.planSummary[0];
    const targetProduct = materials.find(m => m._id === selectedProductId);

    try {
      const payload = {
        planName: `${targetProduct?.name || 'Finished Good'} Plan (${demandQty} ${planSum.uom})`,
        productId: selectedProductId,
        bomId: planSum.bomId,
        quantity: planSum.targetOutputQty,
        totalPlans: planSum.targetOutputQty,
        siteId: selectedSiteId && selectedSiteId !== 'ALL' ? selectedSiteId : undefined,
        warehouseId: selectedWarehouseId && selectedWarehouseId !== 'ALL' ? selectedWarehouseId : warehouses[0]?._id,
        priority: 'MEDIUM',
        notes: `Generated from Demand Planning Engine (Demand: ${demandQty}, Batches: ${planSum.noOfBatches})`
      };

      const res = await api.post('/production-plans/manual', payload);
      if (res.data?.success) {
        const createdPlan = res.data.data;
        setSuccessMsg(`✓ Production Plan ${createdPlan.planNumber} successfully created in UNSCHEDULED status!`);
        if (onPlanCreated) onPlanCreated(createdPlan);
      } else {
        setErrorMsg(res.data?.error || 'Failed to create production plan');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Error creating production plan');
    } finally {
      setCreatingPlan(false);
    }
  };

  // Launch Batch Execution Modal for Batch 1
  const handleLaunchBatchExecution = () => {
    if (!simulationData) return;
    const planSum = simulationData.planSummary?.[0];
    const batch1 = simulationData.batchSummary?.[0];

    const mockInitialPlan = {
      _id: simulationData.planId,
      productId: selectedProductId,
      productName: planSum?.product,
      bomId: planSum?.bomId,
      siteId: selectedSiteId,
      warehouseId: selectedWarehouseId,
      quantity: batch1?.qty || planSum?.batchSize || 1000,
      totalPlans: batch1?.qty || planSum?.batchSize || 1000,
      ingredients: simulationData.materialSummary.map(m => ({
        materialId: m.materialId,
        material: m.materialId,
        materialName: m.material,
        materialCode: m.materialCode,
        totalQuantity: m.qtyPerBatch,
        quantity: m.qtyPerBatch,
        uom: m.uom
      }))
    };

    setBatchExecInitialPlan(mockInitialPlan);
    setIsBatchExecModalOpen(true);
  };

  // Export Sheet 3 to Excel
  const exportToExcel = () => {
    if (!simulationData) return;
    const wb = XLSX.utils.book_new();

    // 1. Plan Summary Sheet
    const ws1 = XLSX.utils.json_to_sheet(simulationData.planSummary || []);
    XLSX.utils.book_append_sheet(wb, ws1, 'Plan_Summary');

    // 2. Batch Summary Sheet
    const ws2 = XLSX.utils.json_to_sheet(simulationData.batchSummary || []);
    XLSX.utils.book_append_sheet(wb, ws2, 'Batch_Summary');

    // 3. Material Summary Sheet
    const ws3 = XLSX.utils.json_to_sheet(simulationData.materialSummary || []);
    XLSX.utils.book_append_sheet(wb, ws3, 'Material_Summary');

    XLSX.writeFile(wb, `Demand_Planning_Sheet3_${Date.now()}.xlsx`);
  };

  const planSum = simulationData?.planSummary?.[0] || null;
  const batchSum = simulationData?.batchSummary || [];
  const matSum = simulationData?.materialSummary || [];
  const maxProd = simulationData?.maxProducible || null;

  return (
    <div className="space-y-4 font-sans text-slate-900 animate-fadeIn">
      {/* 1. INPUTS CONSOLE CARD */}
      <section className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Demand Planning &amp; Requirements Engine</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Sheet 3 Blueprint
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Input target finished product, demand quantity, and location to explode BOM and calculate material netting and maximum producible yield.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunSimulation}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Calculating...' : 'Calculate Demand'}</span>
            </button>
            {simulationData && (
              <button
                onClick={exportToExcel}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="Export Sheet 3 to Excel"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Excel</span>
              </button>
            )}
          </div>
        </div>

        {/* INPUT FIELDS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* PRODUCT DROPDOWN */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Target Product (Finished Good) *
            </label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-indigo-500 focus:bg-white"
            >
              {finishedGoods.map(m => (
                <option key={m._id} value={m._id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          {/* REQUIRED QUANTITY (DEMAND) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Required Quantity (Demand) *
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="10"
                value={demandQty}
                onChange={e => setDemandQty(e.target.value)}
                placeholder="e.g. 4000"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-indigo-500 focus:bg-white pr-12"
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-extrabold text-slate-400 uppercase">
                {planSum?.uom || 'units'}
              </span>
            </div>
          </div>

          {/* LOCATION (SITE) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Production Location / Site
            </label>
            <select
              value={selectedSiteId}
              onChange={e => handleSiteChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-indigo-500 focus:bg-white"
            >
              <option value="ALL">All Sites (Enterprise Rollup)</option>
              {sites.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* WAREHOUSE */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Inventory Warehouse
            </label>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-indigo-500 focus:bg-white"
            >
              <option value="ALL">All Warehouses at Location</option>
              {warehouses
                .filter(w => !selectedSiteId || selectedSiteId === 'ALL' || (w.siteId?._id || w.siteId) === selectedSiteId)
                .map(w => (
                  <option key={w._id} value={w._id}>
                    {w.name} {w.isDefault ? '★ [Default]' : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* ALERTS */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="font-bold cursor-pointer">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="font-bold cursor-pointer">✕</button>
          </div>
        )}
      </section>

      {/* 2. REAL-TIME OUTPUTS & BOTTLENECK ANALYSIS */}
      {simulationData && (
        <div className="space-y-4">
          {/* KPI HIGHLIGHT CARDS & BOTTLENECK BANNER */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* KPI 1: Required Demand */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Demand Quantity</span>
              <div className="text-xl font-black text-slate-900 mt-1">
                {planSum?.demandQty?.toLocaleString()} <span className="text-xs text-slate-500 font-bold">{planSum?.uom}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
                Target Output: {planSum?.targetOutputQty?.toLocaleString()} {planSum?.uom}
              </span>
            </div>

            {/* KPI 2: Batches Required */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Required Batches</span>
              <div className="text-xl font-black text-indigo-600 mt-1">
                {planSum?.noOfBatches} <span className="text-xs text-slate-500 font-bold">Batches</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
                Batch Size: {planSum?.batchSize?.toLocaleString()} {planSum?.uom}
              </span>
            </div>

            {/* KPI 3: Material Availability Status */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Availability Status</span>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                  simulationData.status === 'READY'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : simulationData.status === 'PARTIAL'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  ● {simulationData.status}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                {simulationData.status === 'READY'
                  ? 'All materials available in stock'
                  : `${matSum.filter(m => m.status === 'Shortage').length} item(s) in shortage`}
              </span>
            </div>

            {/* KPI 4: MAXIMUM PRODUCIBLE QUANTITY (Bottleneck Analysis) */}
            <div className={`p-3.5 rounded-xl border shadow-xs ${
              maxProd && maxProd.maxProducibleQty >= (planSum?.targetOutputQty || 0)
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/70 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                  Max Producible Qty
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/80 text-slate-700 border border-slate-200">
                  Bottleneck Analysis
                </span>
              </div>
              <div className="text-xl font-black text-slate-900 mt-1">
                {maxProd?.maxProducibleQty?.toLocaleString()} <span className="text-xs text-slate-600 font-bold">{maxProd?.uom}</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-700 mt-0.5 block truncate" title={maxProd?.bottleneckMaterial}>
                {maxProd?.maxBatches >= (planSum?.noOfBatches || 0)
                  ? `✓ Covers 100% of demand (${maxProd?.maxBatches} batches)`
                  : `Limited by: ${maxProd?.bottleneckMaterial} (${maxProd?.maxBatches} batches max)`}
              </span>
            </div>
          </div>

          {/* ACTION BUTTONS BAR */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium">
              Simulation calculated for <strong>{simulationData.location}</strong> &bull; BOM: <strong>{planSum?.bomNumber}</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCreatePlanFromSimulation}
                disabled={creatingPlan}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{creatingPlan ? 'Creating Plan...' : 'Create Production Plan'}</span>
              </button>

              <button
                onClick={handleLaunchBatchExecution}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Execute Batch 1 (Sheet 1)</span>
              </button>
            </div>
          </div>

          {/* TIER 1: PLAN SUMMARY (Blueprint Sheet 3) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <h3 className="text-xs font-black uppercase tracking-wider">Plan Summary</h3>
              </div>
              <span className="text-[11px] text-slate-300 font-mono">Location: {simulationData.location}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4 text-center">No of Batches</th>
                    <th className="py-2.5 px-4 text-right">Target Output Qty</th>
                    <th className="py-2.5 px-4 text-center">No of Executed</th>
                    <th className="py-2.5 px-4 text-center">No to be Executed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {simulationData.planSummary?.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 font-medium">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {p.product} <span className="text-slate-400 font-mono text-[11px]">({p.productCode})</span>
                      </td>
                      <td className="py-3 px-4 text-center font-black text-indigo-600 font-mono">
                        {p.noOfBatches}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 font-mono">
                        {p.targetOutputQty?.toLocaleString()} {p.uom}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500 font-mono">
                        {p.noOfExecuted || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900 font-mono">
                        {p.noToBeExecuted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TIER 2: BATCH SUMMARY (Blueprint Sheet 3) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <h3 className="text-xs font-black uppercase tracking-wider">Batch Summary</h3>
              </div>
              <span className="text-[11px] text-slate-300 font-mono">{batchSum.length} Discrete Batches</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Batch No</th>
                    <th className="py-2.5 px-4">Mftg Date</th>
                    <th className="py-2.5 px-4">Exp Date</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchSum.map((b, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 font-medium">
                      <td className="py-2.5 px-4 text-slate-900 font-medium">
                        {b.product}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-700">
                        {b.batchNo}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {b.mfgDate ? new Date(b.mfgDate).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {b.expDate ? new Date(b.expDate).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900">
                        {b.qty?.toLocaleString()} {planSum?.uom}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700">
                          {b.status || 'Planned'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TIER 3: MATERIAL SUMMARY (Blueprint Sheet 3) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Material Summary (Requirements vs Centralized Inventory)
                </h3>
              </div>
              <span className="text-[11px] text-slate-300 font-mono">{matSum.length} Ingredients</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Material (MPN)</th>
                    <th className="py-2.5 px-4">Vendor</th>
                    <th className="py-2.5 px-4 text-right">Qty Req</th>
                    <th className="py-2.5 px-4 text-right">Qty Avail.</th>
                    <th className="py-2.5 px-4 text-right">Short / Long</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matSum.map((m, idx) => {
                    const isShortage = m.status === 'Shortage';
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 font-medium">
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-900">{m.material}</div>
                          <div className="text-[11px] font-mono text-slate-400">{m.mpn}</div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {m.vendor}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          {m.qtyReq?.toLocaleString()} <span className="text-[10px] text-slate-400">{m.uom}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          {m.qtyAvail?.toLocaleString()} <span className="text-[10px] text-slate-400">{m.uom}</span>
                        </td>
                        <td className={`py-2.5 px-4 text-right font-mono font-black ${
                          isShortage ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {m.diff > 0 ? `+${m.diff.toLocaleString()}` : m.diff?.toLocaleString()} {m.uom}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                            isShortage
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LAUNCH BATCH EXECUTION MODAL */}
      {isBatchExecModalOpen && (
        <BatchExecutionModal
          isOpen={isBatchExecModalOpen}
          onClose={() => setIsBatchExecModalOpen(false)}
          initialPlan={batchExecInitialPlan}
          onExecutionComplete={() => {
            handleRunSimulation();
          }}
        />
      )}
    </div>
  );
}

