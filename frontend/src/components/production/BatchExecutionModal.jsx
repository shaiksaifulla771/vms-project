import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import {
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Calendar,
  Building2,
  Edit3,
  Sliders,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export default function BatchExecutionModal({
  isOpen,
  onClose,
  initialPlan = null,
  initialBatch = null,
  existingBatch = null,
  onExecutionComplete
}) {
  const [plans, setPlans] = useState([]);
  const [boms, setBoms] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form State
  const [sourceType, setSourceType] = useState(initialPlan ? 'PLAN' : 'ADHOC'); // 'PLAN' | 'ADHOC'
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlan?._id || '');
  const [selectedBomId, setSelectedBomId] = useState(initialPlan?.bomId?._id || initialPlan?.bomId || '');
  const [selectedProductId, setSelectedProductId] = useState(initialPlan?.productId?._id || initialPlan?.productId || '');
  const [siteId, setSiteId] = useState(initialPlan?.siteId?._id || initialPlan?.siteId || '');
  const [warehouseId, setWarehouseId] = useState(initialPlan?.warehouseId?._id || initialPlan?.warehouseId || '');
  
  const [batchNumber, setBatchNumber] = useState(
    initialBatch?.batchNo || `BAT-${Date.now().toString().slice(-6)}`
  );
  const [mfgDate, setMfgDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  const [planOutputQty, setPlanOutputQty] = useState(initialBatch?.qty || initialPlan?.quantity || 1000);
  const [actualOutputQty, setActualOutputQty] = useState(initialBatch?.qty || initialPlan?.quantity || 1000);
  const [varianceReason, setVarianceReason] = useState('');
  const [consumeLots, setConsumeLots] = useState(true);

  // Dynamic Ingredients / Inputs Table
  const [inputs, setInputs] = useState([]);

  // Dynamic IP/OP Edit Mode (for existing executed batch)
  const [isDynamicEditMode, setIsDynamicEditMode] = useState(!!existingBatch);
  const [executedBatchId, setExecutedBatchId] = useState(existingBatch?._id || null);
  const [dynamicAdjustmentReason, setDynamicAdjustmentReason] = useState('');

  // 1. Fetch metadata on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchMeta = async () => {
      setLoading(true);
      try {
        const [planRes, bomRes, matRes, siteRes, whRes] = await Promise.all([
          api.get('/api/production-plans').catch(() => ({ data: { data: [] } })),
          api.get('/api/bom').catch(() => ({ data: { data: [] } })),
          api.get('/api/materials').catch(() => ({ data: { data: [] } })),
          api.get('/api/sites').catch(() => ({ data: { sites: [] } })),
          api.get('/api/warehouses').catch(() => ({ data: { warehouses: [] } })),
        ]);

        const planList = planRes.data?.data || planRes.data?.plans || [];
        const bomList = bomRes.data?.data || bomRes.data?.boms || [];
        const matList = matRes.data?.data || matRes.data?.materials || [];
        const siteList = siteRes.data?.sites || siteRes.data?.data || [];
        const whList = whRes.data?.warehouses || whRes.data?.data || [];

        setPlans(planList);
        setBoms(bomList);
        setMaterials(matList);
        setSites(siteList);
        setWarehouses(whList);

        // Populate initial from plan if supplied
        if (initialPlan) {
          const pSite = initialPlan.siteId?._id || initialPlan.siteId || (siteList[0]?._id || '');
          setSiteId(pSite);
          
          // Auto-select site's default warehouse if not explicitly set
          const targetSite = siteList.find(s => s._id === pSite);
          const defaultWh = targetSite?.defaultWarehouse?._id || 
            whList.find(w => (w.siteId?._id || w.siteId) === pSite && w.isDefault)?._id ||
            whList.find(w => (w.siteId?._id || w.siteId) === pSite)?._id || '';
          setWarehouseId(initialPlan.warehouseId?._id || initialPlan.warehouseId || defaultWh);
        } else if (siteList.length > 0) {
          setSiteId(siteList[0]._id);
          const defaultWh = siteList[0].defaultWarehouse?._id || 
            whList.find(w => (w.siteId?._id || w.siteId) === siteList[0]._id && w.isDefault)?._id || '';
          setWarehouseId(defaultWh);
        }
      } catch (err) {
        console.error('Failed to load batch execution metadata:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMeta();
  }, [isOpen, initialPlan]);

  // 2. Populate inputs whenever selected BOM or plan changes
  useEffect(() => {
    if (existingBatch) {
      // If editing existing executed batch
      setExecutedBatchId(existingBatch._id);
      setIsDynamicEditMode(true);
      setBatchNumber(existingBatch.batchNumber || existingBatch.batchNo || '');
      setPlanOutputQty(existingBatch.expectedQuantity || existingBatch.targetQuantity || 1000);
      setActualOutputQty(existingBatch.actualQuantity || existingBatch.actualOutputQty || 1000);
      setVarianceReason(existingBatch.varianceReason || '');

      const existingInputs = (existingBatch.materials || existingBatch.ingredients || []).map(ing => ({
        materialId: ing.materialId?._id || ing.materialId || ing.material?._id || ing.material,
        code: ing.materialId?.code || ing.materialCode || ing.code || 'RAW-MAT',
        name: ing.materialId?.name || ing.materialName || ing.name || 'Raw Material',
        planInputQty: ing.expectedQuantity || ing.quantity || 0,
        actualInputQty: ing.actualQuantity !== undefined ? ing.actualQuantity : (ing.consumedQuantity || ing.expectedQuantity || 0),
        unit: ing.materialId?.unit || ing.uom || 'kg',
        lotNumber: ing.lotNumber || ''
      }));
      setInputs(existingInputs);
      return;
    }

    if (sourceType === 'PLAN' && selectedPlanId) {
      const plan = plans.find(p => p._id === selectedPlanId);
      if (plan) {
        setSelectedProductId(plan.productId?._id || plan.productId || '');
        setSelectedBomId(plan.bomId?._id || plan.bomId || '');
        
        // Populate ingredients from plan
        if (plan.ingredients && plan.ingredients.length > 0) {
          const ratio = (planOutputQty / (plan.totalPlans || plan.quantity || 1000)) || 1;
          const ingList = plan.ingredients.map(ing => {
            const plannedQty = Math.round((ing.totalQuantity || ing.quantity || 10) * ratio * 100) / 100;
            return {
              materialId: ing.material?._id || ing.material || ing.materialId,
              code: ing.material?.code || ing.materialCode || 'RAW-MAT',
              name: ing.material?.name || ing.materialName || 'Raw Material',
              planInputQty: plannedQty,
              actualInputQty: plannedQty,
              unit: ing.uom || ing.material?.unit || 'kg',
              lotNumber: ''
            };
          });
          setInputs(ingList);
        }
      }
    } else if (selectedBomId) {
      const bom = boms.find(b => b._id === selectedBomId);
      if (bom && bom.components) {
        const bomBatchSize = bom.batchSize || bom.batchQuantity || 1000;
        const scale = planOutputQty / bomBatchSize;
        const ingList = bom.components.map(comp => {
          const plannedQty = Math.round((comp.quantity || 1) * scale * 100) / 100;
          return {
            materialId: comp.materialId?._id || comp.materialId,
            code: comp.materialId?.code || comp.materialCode || 'RAW-MAT',
            name: comp.materialId?.name || comp.materialName || 'Raw Material',
            planInputQty: plannedQty,
            actualInputQty: plannedQty,
            unit: comp.uom || comp.materialId?.unit || 'kg',
            lotNumber: ''
          };
        });
        setInputs(ingList);
      }
    }
  }, [sourceType, selectedPlanId, selectedBomId, planOutputQty, plans, boms, existingBatch]);

  // Calculate Output Variance
  const outputVariancePercent = useMemo(() => {
    if (!planOutputQty || planOutputQty <= 0) return 0;
    return Math.round(((actualOutputQty - planOutputQty) / planOutputQty) * 10000) / 100;
  }, [planOutputQty, actualOutputQty]);

  // Is variance > 5% gate active
  const isVarianceGateActive = useMemo(() => {
    return Math.abs(outputVariancePercent) > 5.0;
  }, [outputVariancePercent]);

  // Handle Input Quantity Change
  const handleInputChange = (index, value) => {
    setInputs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], actualInputQty: Number(value) };
      return updated;
    });
  };

  // Submit Execution (Sheet 1)
  const handleExecuteBatch = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation
    if (!batchNumber.trim()) {
      setErrorMsg('Batch Number is required.');
      return;
    }
    if (actualOutputQty <= 0) {
      setErrorMsg('Actual Output Quantity must be greater than zero.');
      return;
    }
    if (isVarianceGateActive && (!varianceReason || varianceReason.trim().length < 5)) {
      setErrorMsg('Variance exceeds ±5.0%. A detailed Variance Reason (min 5 characters) is strictly mandatory.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        batchNumber,
        sourceType,
        planId: sourceType === 'PLAN' ? selectedPlanId : undefined,
        productId: selectedProductId,
        bomId: selectedBomId,
        siteId,
        warehouseId,
        mfgDate,
        expiryDate,
        planOutputQty: Number(planOutputQty),
        actualOutputQty: Number(actualOutputQty),
        varianceReason: varianceReason.trim(),
        consumeLots,
        inputs: inputs.map(i => ({
          materialId: i.materialId,
          planInputQty: Number(i.planInputQty),
          actualInputQty: Number(i.actualInputQty),
          lotNumber: i.lotNumber || undefined
        }))
      };

      const res = await api.post('/api/batches/execute', payload);
      if (res.data?.success) {
        setSuccessMsg(`✓ Batch ${batchNumber} executed successfully! Stock ledger updated.`);
        setExecutedBatchId(res.data.data?._id || res.data.order?._id);
        setIsDynamicEditMode(true);
        if (onExecutionComplete) onExecutionComplete(res.data.data || res.data.order);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.response?.data?.message || err.message || 'Execution failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Dynamic IP/OP Correction (Sheet 1)
  const handleDynamicIpOpAdjust = async () => {
    if (!executedBatchId) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!dynamicAdjustmentReason || dynamicAdjustmentReason.trim().length < 5) {
      setErrorMsg('A reason for dynamic IP/OP adjustment is required (min 5 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        actualOutputQty: Number(actualOutputQty),
        adjustmentReason: dynamicAdjustmentReason.trim(),
        inputs: inputs.map(i => ({
          materialId: i.materialId,
          actualInputQty: Number(i.actualInputQty)
        }))
      };

      const res = await api.put(`/api/batches/${executedBatchId}/dynamic-ip-op`, payload);
      if (res.data?.success) {
        setSuccessMsg(`✓ Dynamic IP/OP adjustments saved! Inventory ledger delta transactions recorded.`);
        if (onExecutionComplete) onExecutionComplete(res.data.data);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.response?.data?.message || err.message || 'Dynamic adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-3 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  {isDynamicEditMode ? 'Batch Execution: Dynamic IP/OP Correction' : 'Batch Execution Entry (Blueprint Sheet 1)'}
                </h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isDynamicEditMode ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isDynamicEditMode ? 'Active / Post-Entry' : 'Production Floor'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {isDynamicEditMode 
                  ? 'Real-time post-entry recalculation and automatic stock ledger re-balancing.' 
                  : 'Execute planned or ad-hoc production batches with mandatory 5% variance gate and lot control.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ALERTS */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="font-bold ml-2">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="font-bold ml-2">✕</button>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-medium text-slate-700">

          {/* SECTION 1: EXECUTION SOURCE & POSITIONING */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Execution Mode</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                disabled={isDynamicEditMode}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-blue-500"
              >
                <option value="PLAN">From Production Plan</option>
                <option value="ADHOC">Ad-Hoc Floor Execution</option>
              </select>
            </div>

            {sourceType === 'PLAN' ? (
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Select Active Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  disabled={isDynamicEditMode}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-blue-500"
                >
                  <option value="">-- Choose Approved Plan --</option>
                  {plans.map(p => (
                    <option key={p._id} value={p._id}>
                      {p.planNumber} &bull; {p.productName || p.productId?.name || 'Product'} ({p.quantity || p.totalPlans} {p.bomId?.batchUOM || 'units'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Select BOM / Recipe</label>
                <select
                  value={selectedBomId}
                  onChange={(e) => setSelectedBomId(e.target.value)}
                  disabled={isDynamicEditMode}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-blue-500"
                >
                  <option value="">-- Choose BOM Master Recipe --</option>
                  {boms.map(b => (
                    <option key={b._id} value={b._id}>
                      {b.code || b.bomNumber} &bull; {b.name} (Batch: {b.batchSize || 1000} {b.batchUOM || 'kg'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Batch Number</label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                disabled={isDynamicEditMode}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-blue-500"
              />
            </div>
          </div>

          {/* SECTION 2: WAREHOUSE POSITIONING & DATES */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Location / Site</label>
              <select
                value={siteId}
                onChange={(e) => {
                  const sId = e.target.value;
                  setSiteId(sId);
                  const s = sites.find(item => item._id === sId);
                  const defWh = s?.defaultWarehouse?._id || warehouses.find(w => (w.siteId?._id || w.siteId) === sId && w.isDefault)?._id || '';
                  setWarehouseId(defWh);
                }}
                disabled={isDynamicEditMode}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
              >
                {sites.map(s => (
                  <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                Warehouse <span className="text-blue-600 font-bold">(Default Auto-linked)</span>
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                disabled={isDynamicEditMode}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
              >
                {warehouses
                  .filter(w => !siteId || (w.siteId?._id || w.siteId) === siteId)
                  .map(w => (
                    <option key={w._id} value={w._id}>
                      {w.name} {w.isDefault ? '★ [Default]' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Mfg Date</label>
              <input
                type="date"
                value={mfgDate}
                onChange={(e) => setMfgDate(e.target.value)}
                disabled={isDynamicEditMode}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Expiry Date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={isDynamicEditMode}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
              />
            </div>
          </div>

          {/* SECTION 3: OUTPUT VS PLAN & 5% VARIANCE GATE */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-slate-900 uppercase tracking-tight flex items-center space-x-1.5">
                <Sliders className="w-4 h-4 text-blue-600" />
                <span>Finished Goods Output Yield (OP)</span>
              </h4>
              <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                Math.abs(outputVariancePercent) <= 5.0 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-100 text-rose-800 border border-rose-200'
              }`}>
                Variance: {outputVariancePercent > 0 ? `+${outputVariancePercent}%` : `${outputVariancePercent}%`}
                {Math.abs(outputVariancePercent) <= 5.0 ? ' (Within ±5% Tolerance)' : ' (Exceeds ±5% Threshold!)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Target / Plan Output Qty</label>
                <input
                  type="number"
                  value={planOutputQty}
                  onChange={(e) => setPlanOutputQty(Number(e.target.value))}
                  disabled={isDynamicEditMode}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-black text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                  Actual Output Qty {isDynamicEditMode && <span className="text-blue-600">(Editable IP/OP)</span>}
                </label>
                <input
                  type="number"
                  value={actualOutputQty}
                  onChange={(e) => setActualOutputQty(Number(e.target.value))}
                  className="w-full bg-white border border-blue-400 rounded-lg px-2.5 py-1.5 font-black text-blue-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center pt-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consumeLots}
                    onChange={(e) => setConsumeLots(e.target.checked)}
                    disabled={isDynamicEditMode}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Auto-consume lot stock (FIFO)</span>
                </label>
              </div>
            </div>

            {/* MANDATORY 5% VARIANCE GATE INPUT */}
            {isVarianceGateActive && (
              <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-1.5 animate-scaleIn">
                <div className="flex items-center space-x-1.5 text-amber-900 font-black">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>5.0% Variance Gate Triggered: Managerial Justification Mandatory</span>
                </div>
                <p className="text-[10px] text-amber-800">
                  The actual production output deviates from plan by {outputVariancePercent}%. Please provide an official audit reason for the variance before proceeding.
                </p>
                <input
                  type="text"
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  placeholder="Enter specific cause (e.g. Moisture evaporation, equipment calibration, overfill batch)"
                  className="w-full bg-white border border-amber-400 rounded-lg px-3 py-1.5 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          {/* SECTION 4: INGREDIENTS / INPUT MATERIALS TABLE (IP) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-slate-100/90 px-3.5 py-2 flex items-center justify-between border-b border-slate-200">
              <h4 className="font-black text-slate-800 uppercase tracking-tight flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Component Inputs &amp; Lot Consumption (IP Table)</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-500">{inputs.length} Ingredients</span>
            </div>

            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2">Material</th>
                    <th className="p-2">Code</th>
                    <th className="p-2 text-right">Plan Input Qty</th>
                    <th className="p-2 text-right">Actual Input Qty (IP)</th>
                    <th className="p-2">UOM</th>
                    <th className="p-2 text-right">Variance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {inputs.map((inp, idx) => {
                    const diff = inp.actualInputQty - inp.planInputQty;
                    const vPct = inp.planInputQty > 0 ? Math.round((diff / inp.planInputQty) * 1000) / 10 : 0;
                    return (
                      <tr key={idx} className="hover:bg-blue-50/40">
                        <td className="p-2 font-bold text-slate-900">{inp.name}</td>
                        <td className="p-2 font-mono text-slate-500 text-[10px]">{inp.code}</td>
                        <td className="p-2 text-right font-mono">{inp.planInputQty}</td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            value={inp.actualInputQty}
                            onChange={(e) => handleInputChange(idx, e.target.value)}
                            className="w-24 px-2 py-0.5 text-right font-mono font-bold bg-white border border-slate-300 rounded focus:border-blue-500"
                          />
                        </td>
                        <td className="p-2 text-slate-500">{inp.unit}</td>
                        <td className={`p-2 text-right font-mono font-bold ${
                          Math.abs(vPct) > 5 ? 'text-amber-600' : 'text-slate-600'
                        }`}>
                          {vPct > 0 ? `+${vPct}%` : `${vPct}%`}
                        </td>
                      </tr>
                    );
                  })}
                  {inputs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 font-semibold">
                        No recipe components selected. Select a Plan or BOM above to populate inputs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* DYNAMIC IP/OP ADJUSTMENT REASON (when editing executed batch) */}
          {isDynamicEditMode && (
            <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1.5">
              <label className="block text-[10px] font-black text-indigo-900 uppercase">
                Dynamic IP/OP Adjustment Reason (Required for Ledger Adjustment)
              </label>
              <input
                type="text"
                value={dynamicAdjustmentReason}
                onChange={(e) => setDynamicAdjustmentReason(e.target.value)}
                placeholder="Reason for post-entry correction (e.g. Weigh-scale correction, lab test yield revision)"
                className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-1.5 font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[10px] text-slate-400 font-semibold">
            {isDynamicEditMode 
              ? 'Changes update actual quantities and record compensatory stock ledger transactions.' 
              : 'Submitting issues finished stock to warehouse and consumes raw material lots via FIFO.'}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
            >
              Cancel
            </button>

            {isDynamicEditMode ? (
              <button
                onClick={handleDynamicIpOpAdjust}
                disabled={submitting}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors"
              >
                {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
                <span>Save Dynamic IP/OP Adjustments</span>
              </button>
            ) : (
              <button
                onClick={handleExecuteBatch}
                disabled={submitting}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors"
              >
                {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>Post Batch Execution</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

