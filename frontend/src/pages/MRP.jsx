import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../services/api';
import productionPlanService from '../services/productionPlanService';
import { useSiteContext } from '../context/SiteContext';
import {
  Cpu,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  Layers,
  Calendar,
  Factory,
  Boxes,
  Zap,
  ShieldCheck,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PlusCircle,
  Clock,
  CheckCircle,
  XCircle,
  PauseCircle,
  FileText,
  Search,
  Filter,
  Eye,
  Sliders,
  SendHorizontal,
  ArrowRight,
  X,
  Plus,
  Trash2,
  TrendingDown,
  Scale
} from 'lucide-react';

const statusBadgeStyles = {
  UNSCHEDULED: 'bg-amber-50 text-amber-700 border-amber-200',
  Unscheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'Partially Scheduled': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  RELEASED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Released: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  'In Production': 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-300',
  Completed: 'bg-slate-100 text-slate-700 border-slate-300',
  ON_HOLD: 'bg-orange-50 text-orange-700 border-orange-200',
  'On Hold': 'bg-orange-50 text-orange-700 border-orange-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const materialBadgeStyles = {
  READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  SHORTAGE: 'bg-rose-50 text-rose-700 border-rose-200',
  Shortage: 'bg-rose-50 text-rose-700 border-rose-200',
  'Not Evaluated': 'bg-slate-50 text-slate-600 border-slate-200',
};

function useToast(duration = 5000) {
  const [msg, setMsg] = useState('');
  const timerRef = useRef(null);
  const show = useCallback((text) => {
    setMsg(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(''), duration);
  }, [duration]);
  const clear = useCallback(() => { setMsg(''); if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [msg, show, clear];
}

export default function MRP() {
  const { activeSiteId, activeWarehouseId, activeSite, activeWarehouse, filteredWarehouses } = useSiteContext();
  const [viewTab, setViewTab] = useState('plans'); // 'plans' | 'netting' | 'runs'
  const [planFilter, setPlanFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // MRP Runs State
  const [runs, setRuns] = useState([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);

  // Production Plans State
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [sites, setSites] = useState([]);

  // Action / Modal States
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isUseModalOpen, setIsUseModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isMatCheckModalOpen, setIsMatCheckModalOpen] = useState(false);

  const [activePlan, setActivePlan] = useState(null);
  const [plansToUseQty, setPlansToUseQty] = useState(1);
  const [matCheckResult, setMatCheckResult] = useState(null);
  const [matChecking, setMatChecking] = useState(false);
  const [executingMRP, setExecutingMRP] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [submittingUse, setSubmittingUse] = useState(false);

  const [errorMsg, showError, clearError] = useToast(6000);
  const [successMsg, showSuccess, clearSuccess] = useToast(5000);

  const [runForm, setRunForm] = useState({
    productId: '',
    siteId: '',
    warehouseId: 'all',
    warehouseScope: 'all',
    targetQty: 100,
    horizonDays: 30,
    requiredDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  // Manual Plan Form with Plan Quantities & Ingredients
  const [manualForm, setManualForm] = useState({
    planName: '',
    productId: '',
    bomId: '',
    warehouseId: '',
    totalPlans: 50,
    priority: 'MEDIUM',
    requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
    notes: '',
    ingredients: [],
  });

  // Scheduling Form
  const [scheduleForm, setScheduleForm] = useState({
    productionDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    shiftId: 'Morning Shift',
    lineId: 'Main Assembly Line 1',
    machineId: 'Machine Alpha',
    warehouseId: '',
    estimatedDuration: 480,
  });

  // Fetch Core Data
  const fetchData = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const [matsRes, whsRes, bomsRes, sitesRes, runsRes, plansRes] = await Promise.all([
        api.get('/materials'),
        api.get('/warehouses'),
        api.get('/boms').catch(() => ({ data: { boms: [] } })),
        api.get('/sites').catch(() => ({ data: { data: [], sites: [] } })),
        api.get('/mrp', { params: { ...query, page: runsPage, limit: 20 } }),
        productionPlanService.getProductionPlans(query),
      ]);

      const matList = matsRes.data.data || matsRes.data.materials || [];
      const whList = whsRes.data.data || whsRes.data.warehouses || [];
      const bomList = bomsRes.data.data || bomsRes.data.boms || [];
      const siteList = sitesRes.data.data || sitesRes.data.sites || [];
      const runList = runsRes.data.runs || [];
      const planList = plansRes.data || plansRes.plans || [];

      setMaterials(matList);
      setWarehouses(whList);
      setBoms(bomList);
      setSites(siteList);
      setRuns(runList);
      setTotalRuns(runsRes.data.total || runList.length);
      setPlans(planList);

      // Pre-select defaults
      const makeMats = matList.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE');
      if (makeMats.length > 0 && !runForm.productId) {
        setRunForm(prev => ({ ...prev, productId: makeMats[0]._id }));
        setManualForm(prev => ({ ...prev, productId: makeMats[0]._id, planName: `${makeMats[0].name} Production` }));
      }
      if (whList.length > 0 && !runForm.warehouseId) {
        setManualForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
        setScheduleForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
      }
      if (siteList.length > 0 && !runForm.siteId) {
        setRunForm(prev => ({ ...prev, siteId: siteList[0]._id }));
      }

      if (runList.length > 0 && !selectedRun) {
        await inspectRun(runList[0]._id);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to load MRP dashboard data');
    } finally {
      setLoadingPlans(false);
    }
  }, [runsPage, activeSiteId, activeWarehouseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronize modal forms with active Global Site & Warehouse context
  useEffect(() => {
    if (activeSiteId) {
      setRunForm(prev => ({
        ...prev,
        siteId: activeSiteId,
        warehouseId: activeWarehouseId || 'all',
        warehouseScope: !activeWarehouseId || activeWarehouseId === 'all' ? 'all' : undefined,
      }));
      const defaultWh = activeWarehouseId || (filteredWarehouses[0]?._id || '');
      if (defaultWh) {
        setManualForm(prev => ({ ...prev, warehouseId: defaultWh }));
        setScheduleForm(prev => ({ ...prev, warehouseId: defaultWh }));
      }
    }
  }, [activeSiteId, activeWarehouseId, filteredWarehouses]);

  // Sync BOM and Plan Name when product changes in manual form
  useEffect(() => {
    if (manualForm.productId) {
      const selectedProd = materials.find(m => m._id === manualForm.productId);
      if (selectedProd && !manualForm.planName) {
        setManualForm(prev => ({ ...prev, planName: `${selectedProd.name} Production` }));
      }

      if (boms.length > 0) {
        const matchingBoms = boms.filter(b => (b.productId?._id || b.productId) === manualForm.productId);
        if (matchingBoms.length > 0) {
          setManualForm(prev => ({ ...prev, bomId: matchingBoms[0]._id }));
        }
      }
    }
  }, [manualForm.productId, boms, materials]);

  const inspectRun = async (runId) => {
    try {
      const res = await api.get(`/mrp/runs/${runId}`);
      if (res.data.success) {
        setSelectedRun(res.data.mrpRun);
        setRequirements(res.data.requirements || []);
      }
    } catch (err) {
      console.error('Failed to inspect MRP run:', err);
    }
  };

  // Add custom ingredient row
  const addIngredientRow = () => {
    const rawMats = materials.filter(m => m.type === 'Raw Material' || m.type === 'Packaged Material' || m.makeOrBuy === 'BUY');
    const firstMat = rawMats[0] || materials[0];
    setManualForm(prev => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          materialId: firstMat?._id || '',
          quantityPerPlan: 1,
          uom: firstMat?.unit || 'pcs',
          warehouseId: prev.warehouseId || warehouses[0]?._id || '',
          lossPercentage: 0,
        }
      ]
    }));
  };

  const updateIngredientRow = (index, field, value) => {
    setManualForm(prev => {
      const updated = [...prev.ingredients];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'materialId') {
        const mat = materials.find(m => m._id === value);
        if (mat) updated[index].uom = mat.unit || 'pcs';
      }
      return { ...prev, ingredients: updated };
    });
  };

  const removeIngredientRow = (index) => {
    setManualForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, idx) => idx !== index)
    }));
  };

  // Trigger MRP Run
  const handleExecuteMRP = async (e) => {
    e.preventDefault();
    if (!runForm.productId || !runForm.siteId || runForm.targetQty <= 0) {
      showError('Please select a valid product, site, and target quantity > 0.');
      return;
    }
    // Build payload: if warehouseId is 'all', send warehouseScope='all' with no warehouseId
    const payload = { ...runForm };
    if (payload.warehouseId === 'all') {
      payload.warehouseScope = 'all';
      delete payload.warehouseId;
    } else {
      payload.warehouseScope = undefined;
    }
    setExecutingMRP(true);
    try {
      const res = await api.post('/mrp/run', payload);
      if (res.data.success) {
        showSuccess(`MRP Calculation Completed! Run: ${res.data.mrpRun.runNumber}. Production plans created in UNSCHEDULED status.`);
        setIsRunModalOpen(false);
        await fetchData();
        if (res.data.mrpRun) {
          await inspectRun(res.data.mrpRun._id);
        }
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'MRP calculation failed');
    } finally {
      setExecutingMRP(false);
    }
  };

  // Create Manual Plan
  const handleCreateManualPlan = async (e) => {
    e.preventDefault();
    if (!manualForm.productId || !manualForm.warehouseId || manualForm.totalPlans <= 0) {
      showError('Please specify Product, Warehouse, and Number of Plans > 0');
      return;
    }
    setSubmittingPlan(true);
    try {
      const res = await productionPlanService.createManualPlan(manualForm);
      if (res.success) {
        showSuccess(`Production Plan ${res.data.planNumber} created with ${res.data.totalPlans || res.data.availablePlans} available plans.`);
        setIsManualModalOpen(false);
        await fetchData();
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to create plan');
    } finally {
      setSubmittingPlan(false);
    }
  };

  // Open Schedule Modal
  const openScheduleModal = (plan) => {
    setActivePlan(plan);
    setScheduleForm({
      productionDate: plan.requiredDate ? new Date(plan.requiredDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      startTime: plan.schedule?.startTime || '08:00',
      endTime: plan.schedule?.endTime || '16:00',
      shiftId: plan.schedule?.shiftId || 'Morning Shift',
      lineId: plan.workCenter || 'Main Assembly Line 1',
      machineId: plan.schedule?.machineId || 'Machine Alpha',
      warehouseId: plan.warehouseId?._id || plan.warehouseId || warehouses[0]?._id,
      estimatedDuration: plan.schedule?.estimatedDuration || 480,
    });
    setIsScheduleModalOpen(true);
  };

  // Submit Schedule
  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!activePlan) return;
    setSubmittingSchedule(true);
    try {
      const res = await productionPlanService.schedulePlan(activePlan._id, scheduleForm);
      if (res.success) {
        showSuccess(`Plan ${activePlan.planNumber} successfully scheduled.`);
        setIsScheduleModalOpen(false);
        await fetchData();
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Scheduling failed');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  // Open Use / Release Partial Plans Modal
  const openUseModal = (plan) => {
    setActivePlan(plan);
    const maxAvailable = plan.availablePlans ?? plan.quantity ?? 1;
    setPlansToUseQty(Math.min(maxAvailable, 10));
    setIsUseModalOpen(true);
  };

  // Submit Use / Release Plans
  const handleUseSubmit = async (e) => {
    e.preventDefault();
    if (!activePlan) return;
    setSubmittingUse(true);
    try {
      const res = await productionPlanService.usePlans(activePlan._id, { quantity: plansToUseQty });
      if (res.success) {
        showSuccess(`Successfully released ${plansToUseQty} plans into Production Order ${res.productionOrder?.prdNumber || ''}.`);
        setIsUseModalOpen(false);
        await fetchData();
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to use plans');
    } finally {
      setSubmittingUse(false);
    }
  };

  // Run Material Check
  const handleMaterialCheck = async (plan, strictWarehouse = false) => {
    setMatChecking(true);
    setActivePlan(plan);
    try {
      const targetWh = plan.warehouseId?._id || plan.warehouseId;
      const targetSite = plan.siteId?._id || plan.siteId || activeSiteId;
      const res = await productionPlanService.checkMaterialAvailability(
        plan._id,
        targetWh,
        targetSite,
        strictWarehouse
      );
      if (res.success) {
        setMatCheckResult(res.materialStatus);
        setIsMatCheckModalOpen(true);
        await fetchData();
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Material check failed');
    } finally {
      setMatChecking(false);
    }
  };

  // Approve Plan
  const handleApprovePlan = async (planId) => {
    try {
      const res = await productionPlanService.approvePlan(planId);
      if (res.success) {
        showSuccess('Plan approved successfully.');
        await fetchData();
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Approval failed');
    }
  };

  // Release All Available Plans
  const handleReleaseAll = async (plan) => {
    const qty = plan.availablePlans ?? plan.quantity ?? 1;
    try {
      const res = await productionPlanService.releasePlan(plan._id, qty);
      if (res.success) {
        showSuccess(res.message || 'Plan released to Production Order.');
        await fetchData();
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Release failed');
    }
  };

  // Filtered Production Plans
  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      const statusNorm = (p.status || '').toUpperCase();
      if (planFilter === 'UNSCHEDULED' && statusNorm !== 'UNSCHEDULED') return false;
      if (planFilter === 'SCHEDULED' && statusNorm !== 'SCHEDULED') return false;
      if (planFilter === 'SHORTAGES') {
        const matStatus = (p.materialStatus?.status || '').toUpperCase();
        if (matStatus !== 'SHORTAGE' && matStatus !== 'PARTIAL') return false;
      }
      if (planFilter === 'RELEASED' && statusNorm !== 'RELEASED') return false;
      if (planFilter === 'IN_PROGRESS' && (statusNorm !== 'IN_PROGRESS' && statusNorm !== 'IN PRODUCTION')) return false;
      if (planFilter === 'COMPLETED' && statusNorm !== 'COMPLETED') return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const num = (p.planNumber || '').toLowerCase();
        const name = (p.planName || '').toLowerCase();
        const pName = (p.productId?.name || p.productName || '').toLowerCase();
        const pCode = (p.productId?.code || p.productCode || '').toLowerCase();
        if (!num.includes(q) && !name.includes(q) && !pName.includes(q) && !pCode.includes(q)) return false;
      }
      return true;
    });
  }, [plans, planFilter, searchQuery]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const totalPlans = plans.length;
    let totalPlanUnits = 0;
    let availableUnits = 0;
    let releasedUnits = 0;

    plans.forEach(p => {
      totalPlanUnits += p.totalPlans || p.quantity || 0;
      availableUnits += p.availablePlans !== undefined ? p.availablePlans : (p.quantity || 0);
      releasedUnits += p.releasedPlans || 0;
    });

    const unscheduledCount = plans.filter(p => (p.status || '').toUpperCase() === 'UNSCHEDULED').length;
    const scheduledCount = plans.filter(p => (p.status || '').toUpperCase() === 'SCHEDULED').length;
    const shortagesCount = plans.filter(p => {
      const ms = (p.materialStatus?.status || '').toUpperCase();
      return ms === 'SHORTAGE' || ms === 'PARTIAL';
    }).length;
    const releasedCount = plans.filter(p => (p.status || '').toUpperCase() === 'RELEASED').length;

    return { totalPlans, totalPlanUnits, availableUnits, releasedUnits, unscheduledCount, scheduledCount, shortagesCount, releasedCount };
  }, [plans]);

  // Warehouses filtered by selected site for MRP Run modal
  const filteredRunWarehouses = useMemo(() => {
    if (!runForm.siteId) return warehouses;
    return warehouses.filter(w => (w.siteId?._id || w.siteId) === runForm.siteId);
  }, [warehouses, runForm.siteId]);

  const plannableMaterials = useMemo(() => {
    return materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE');
  }, [materials]);

  return (
    <div className="space-y-5 font-sans text-slate-900 bg-slate-50/70 min-h-screen p-3 md:p-6">
      {/* HEADER */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-slate-900 text-white rounded-md flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> Planning & MRP
              </span>
              <span className="text-xs text-slate-500 font-medium">● Material Requirements & Production Plans</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              MRP & Planning
            </h1>
            <p className="text-xs text-slate-500 max-w-3xl">
              Calculate material requirements netting, manage multi-ingredient production plans, and schedule manufacturing batches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsRunModalOpen(true)}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Play className="h-4 w-4" />
              <span>Run MRP Engine</span>
            </button>

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Create Manual Plan</span>
            </button>

            <button
              onClick={fetchData}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl shadow-sm transition-colors"
              title="Refresh Workbench"
            >
              <RefreshCw className={`h-4 w-4 ${loadingPlans ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* TOAST ALERTS */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={clearError} className="underline font-bold ml-4 shrink-0">Dismiss</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={clearSuccess} className="underline font-bold ml-4 shrink-0">Dismiss</button>
          </div>
        )}
      </section>

      {/* KPI METRICS TILES */}
      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Total Pool</span>
            <Boxes className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{metrics.totalPlanUnits} <span className="text-xs font-normal text-slate-500">units</span></p>
          <p className="text-[11px] text-slate-500 font-medium">Across {metrics.totalPlans} Production Plans</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Available Plans</span>
            <Scale className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700">{metrics.availableUnits} <span className="text-xs font-normal text-emerald-600">units</span></p>
          <p className="text-[11px] text-emerald-600/80 font-medium">Ready for Release / Batching</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Released to Shop</span>
            <SendHorizontal className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-700">{metrics.releasedUnits} <span className="text-xs font-normal text-blue-600">units</span></p>
          <p className="text-[11px] text-blue-600/80 font-medium">In Active Production Orders</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Unscheduled Plans</span>
            <Calendar className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-700">{metrics.unscheduledCount}</p>
          <p className="text-[11px] text-amber-600/80 font-medium">Awaiting Line & Shift Slot</p>
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm space-y-1 ${metrics.shortagesCount > 0 ? 'bg-rose-50/60 border-rose-200 text-rose-700' : 'bg-white border-slate-200 text-slate-700'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Active Shortages</span>
            <AlertTriangle className={`h-4 w-4 ${metrics.shortagesCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-black ${metrics.shortagesCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{metrics.shortagesCount}</p>
          <p className="text-[11px] font-medium">{metrics.shortagesCount > 0 ? 'Procurement Action Required' : 'All Materials In Stock'}</p>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="space-y-4">
        {/* VIEW NAVIGATION BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              ['plans', 'Production Plans', FileText],
              ['netting', 'MRP Netting Matrix', Cpu],
              ['runs', 'Run History', Layers],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setViewTab(id)}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
                  viewTab === id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search plans, materials, codes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
        </div>

        {/* VIEW 1: PRODUCTION PLANS TABLE */}
        {viewTab === 'plans' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-3 p-4">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-100">
              {[
                ['ALL', 'All Plans', plans.length],
                ['UNSCHEDULED', 'Unscheduled', metrics.unscheduledCount],
                ['SCHEDULED', 'Scheduled', metrics.scheduledCount],
                ['SHORTAGES', 'Shortages', metrics.shortagesCount],
                ['RELEASED', 'Released', metrics.releasedCount],
                ['IN_PROGRESS', 'In Progress', plans.filter(p => (p.status || '').toUpperCase() === 'IN_PROGRESS' || (p.status || '').toUpperCase() === 'IN PRODUCTION').length],
                ['COMPLETED', 'Completed', plans.filter(p => (p.status || '').toUpperCase() === 'COMPLETED').length],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setPlanFilter(key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    planFilter === key
                      ? 'bg-orange-50 text-orange-700 border border-orange-200'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${planFilter === key ? 'bg-orange-200/60 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Plans Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Plan Details</th>
                    <th className="p-3">Product</th>
                    <th className="p-3 text-center">Plan Counts (Avail / Total)</th>
                    <th className="p-3">Required By</th>
                    <th className="p-3 text-center">Material Status</th>
                    <th className="p-3 text-center">Priority</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPlans.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                        No production plans match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredPlans.map(plan => {
                      const statusNorm = (plan.status || 'UNSCHEDULED').toUpperCase();
                      const matStatus = plan.materialStatus?.status || 'Not Evaluated';
                      const pName = plan.productId?.name || plan.productName || 'Finished Product';
                      const pCode = plan.productId?.code || plan.productCode || 'FG-001';
                      const totalP = plan.totalPlans || plan.quantity || 1;
                      const availP = plan.availablePlans !== undefined ? plan.availablePlans : plan.quantity;
                      const releasedP = plan.releasedPlans || 0;

                      return (
                        <tr key={plan._id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 font-mono font-extrabold text-blue-600">
                            {plan.planNumber}
                            <span className="block text-[11px] font-bold text-slate-800 font-sans">{plan.planName || 'Standard Plan'}</span>
                            <span className="block text-[10px] font-normal text-slate-400">{plan.source || plan.planSource || 'MRP'}</span>
                          </td>
                          <td className="p-3">
                            <p className="font-extrabold text-slate-900">{pName}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{pCode}</p>
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg font-mono">
                              <span className="font-black text-emerald-700">{availP}</span>
                              <span className="text-slate-400">/</span>
                              <span className="font-bold text-slate-800">{totalP}</span>
                              {releasedP > 0 && (
                                <span className="text-[10px] text-blue-600 font-normal">({releasedP} rel)</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 font-medium whitespace-nowrap">
                            {plan.requiredDate ? new Date(plan.requiredDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleMaterialCheck(plan)}
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md border text-[10px] font-extrabold uppercase whitespace-nowrap tracking-wide leading-none transition-transform hover:scale-105 ${
                                materialBadgeStyles[matStatus] || 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                              title="Click to re-evaluate material availability"
                            >
                              {matStatus}
                            </button>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase whitespace-nowrap leading-none ${
                              (plan.priority || '').toUpperCase() === 'HIGH' || (plan.priority || '').toUpperCase() === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : (plan.priority || '').toUpperCase() === 'LOW'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-blue-50 text-blue-700'
                            }`}>
                              {plan.priority || 'MEDIUM'}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md border text-[10px] font-extrabold uppercase whitespace-nowrap tracking-wide leading-none ${statusBadgeStyles[plan.status] || 'bg-slate-100 text-slate-700'}`}>
                              {plan.status || 'UNSCHEDULED'}
                            </span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Use / Release Partial Plans if Available */}
                              {availP > 0 && (
                                <button
                                  onClick={() => openUseModal(plan)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                  title="Release partial or full plan batch to Production Order"
                                >
                                  <SendHorizontal className="h-3 w-3" /> Use Plans
                                </button>
                              )}

                              {/* Schedule Action if Unscheduled */}
                              {(statusNorm === 'UNSCHEDULED' || statusNorm === 'ON_HOLD') && (
                                <button
                                  onClick={() => openScheduleModal(plan)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                >
                                  <Calendar className="h-3 w-3" /> Schedule
                                </button>
                              )}

                              {/* Reschedule Action if Scheduled */}
                              {statusNorm === 'SCHEDULED' && (
                                <button
                                  onClick={() => openScheduleModal(plan)}
                                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <Sliders className="h-3 w-3" /> Reschedule
                                </button>
                              )}

                              {/* View Details */}
                              <button
                                onClick={() => { setActivePlan(plan); setIsDetailModalOpen(true); }}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                                title="View Plan Details & Ingredients"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
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

        {/* VIEW 2: MRP NETTING & REQUIREMENTS */}
        {viewTab === 'netting' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
            {selectedRun ? (
              <>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">
                      {selectedRun.runNumber} &bull; {selectedRun.productId?.name} ({selectedRun.productId?.code})
                    </h4>
                    <p className="text-slate-500">
                      Site: <strong>{selectedRun.siteId?.name || '—'}</strong> &bull; Warehouse: <strong>{selectedRun.warehouseId?.name || 'All Warehouses'}</strong> &bull; Target: <strong>{selectedRun.targetQty} units</strong> &bull; Horizon: <strong>{selectedRun.horizonDays || 30} Days</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase ${selectedRun.summary?.hasShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {selectedRun.summary?.hasShortage ? 'Shortage Detected' : 'Materials Ready'}
                    </span>
                  </div>
                </div>

                {/* Requirements Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Component Material</th>
                        <th className="p-3 text-right">Gross Required</th>
                        <th className="p-3 text-right">Available Stock</th>
                        <th className="p-3 text-right">On-Order Supply</th>
                        <th className="p-3 text-right">Net Shortage</th>
                        <th className="p-3 text-center">Lead Time</th>
                        <th className="p-3 text-center">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {requirements.map((req, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <p className="font-extrabold text-slate-900">{req.materialName}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{req.materialCode}</p>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">{req.requiredQty} {req.unit}</td>
                          <td className="p-3 text-right font-mono text-slate-600">{req.availableQty} {req.unit}</td>
                          <td className="p-3 text-right font-mono text-slate-600">{req.onOrderQty || 0} {req.unit}</td>
                          <td className={`p-3 text-right font-mono font-extrabold ${req.shortageQty > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {req.shortageQty || 0} {req.unit}
                          </td>
                          <td className="p-3 text-center text-slate-500">{req.suggestedLeadTimeDays || 7} Days</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              req.action === 'Procure' ? 'bg-rose-100 text-rose-800' :
                              req.action === 'Produce' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {req.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="p-8 text-center text-slate-400 italic">No MRP Run selected. Execute a new calculation to view netting.</p>
            )}
          </div>
        )}

        {/* VIEW 3: MRP RUN HISTORY */}
        {viewTab === 'runs' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">Historical MRP Calculation Runs</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Run Number</th>
                    <th className="p-3">Target Product</th>
                    <th className="p-3 text-right">Target Quantity</th>
                    <th className="p-3">Warehouse</th>
                    <th className="p-3 text-center">Shortage Status</th>
                    <th className="p-3">Executed At</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.map(r => (
                    <tr key={r._id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-extrabold text-blue-600">{r.runNumber}</td>
                      <td className="p-3 font-extrabold text-slate-900">{r.productId?.name || 'Finished Product'}</td>
                      <td className="p-3 text-right font-extrabold text-slate-800">{r.targetQty}</td>
                      <td className="p-3 text-slate-600">{r.warehouseId?.name || '—'}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          r.summary?.hasShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.summary?.hasShortage ? 'Shortages Present' : 'Balanced'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => { inspectRun(r._id); setViewTab('netting'); }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded text-[11px] transition-colors"
                        >
                          Inspect Netting
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: EXECUTE MRP RUN */}
      {isRunModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Execute MRP Calculation</h3>
                  <p className="text-xs text-slate-500">Calculate net material requirements and generate plan counts</p>
                </div>
              </div>
              <button onClick={() => setIsRunModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteMRP} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Target Product (MAKE)</label>
                <select
                  value={runForm.productId}
                  onChange={e => setRunForm({ ...runForm, productId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  required
                >
                  {plannableMaterials.map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Target Number of Plans</label>
                  <input
                    type="number"
                    min="1"
                    value={runForm.targetQty}
                    onChange={e => setRunForm({ ...runForm, targetQty: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Horizon (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={runForm.horizonDays}
                    onChange={e => setRunForm({ ...runForm, horizonDays: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Site</label>
                  <select
                    value={runForm.siteId}
                    onChange={e => setRunForm({ ...runForm, siteId: e.target.value, warehouseId: 'all' })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  >
                    <option value="" disabled>Select a Site...</option>
                    {sites.map(s => (
                      <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Warehouse Scope</label>
                  <select
                    value={runForm.warehouseId}
                    onChange={e => setRunForm({ ...runForm, warehouseId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="all">All Warehouses</option>
                    {filteredRunWarehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code}) — {w.type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Required Completion Date</label>
                  <input
                    type="date"
                    value={runForm.requiredDate}
                    onChange={e => setRunForm({ ...runForm, requiredDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRunModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={executingMRP}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className={`h-4 w-4 ${executingMRP ? 'animate-spin' : ''}`} />
                  <span>{executingMRP ? 'Calculating...' : 'Run MRP Engine'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE MANUAL PLAN WITH PLAN COUNTS & INGREDIENTS */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Create Production Plan</h3>
                  <p className="text-xs text-slate-500">Configure plan name, plan counts, and multi-ingredient requirements</p>
                </div>
              </div>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualPlan} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Plan Name</label>
                  <input
                    type="text"
                    value={manualForm.planName}
                    onChange={e => setManualForm({ ...manualForm, planName: e.target.value })}
                    placeholder="e.g. Chocolate Production Batch A"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Product (MAKE Materials)</label>
                  <select
                    value={manualForm.productId}
                    onChange={e => setManualForm({ ...manualForm, productId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  >
                    {plannableMaterials.map(m => (
                      <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Number of Plans (Units)</label>
                  <input
                    type="number"
                    min="1"
                    value={manualForm.totalPlans}
                    onChange={e => setManualForm({ ...manualForm, totalPlans: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Priority</label>
                  <select
                    value={manualForm.priority}
                    onChange={e => setManualForm({ ...manualForm, priority: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Target Warehouse</label>
                  <select
                    value={manualForm.warehouseId}
                    onChange={e => setManualForm({ ...manualForm, warehouseId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Active BOM (Optional)</label>
                  <select
                    value={manualForm.bomId}
                    onChange={e => setManualForm({ ...manualForm, bomId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="">Custom / Manual Ingredients</option>
                    {boms.filter(b => (b.productId?._id || b.productId) === manualForm.productId).map(b => (
                      <option key={b._id} value={b._id}>{b.bomNumber} (v{b.version || 1})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Required By Date</label>
                  <input
                    type="date"
                    value={manualForm.requiredDate}
                    onChange={e => setManualForm({ ...manualForm, requiredDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  />
                </div>
              </div>

              {/* CUSTOM INGREDIENTS BUILDER (When no BOM selected) */}
              {!manualForm.bomId && (
                <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-700 uppercase text-[10px] tracking-wider">Multi-Ingredient Specification</span>
                    <button
                      type="button"
                      onClick={addIngredientRow}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-lg text-[11px] flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add Ingredient
                    </button>
                  </div>

                  {manualForm.ingredients.length === 0 ? (
                    <p className="text-slate-400 italic text-[11px] py-2 text-center">No custom ingredients added. Click "Add Ingredient" to add raw materials.</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {manualForm.ingredients.map((ing, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white p-2 border border-slate-200 rounded-lg">
                          <select
                            value={ing.materialId}
                            onChange={e => updateIngredientRow(idx, 'materialId', e.target.value)}
                            className="flex-1 p-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                          >
                            {materials.map(m => (
                              <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            min="0.001"
                            value={ing.quantityPerPlan}
                            onChange={e => updateIngredientRow(idx, 'quantityPerPlan', Number(e.target.value))}
                            placeholder="Qty / plan"
                            className="w-20 p-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                          />
                          <span className="text-[10px] text-slate-500 font-mono w-10">{ing.uom}</span>
                          <span className="text-[11px] font-bold text-slate-700 w-24 font-mono text-right">
                            Total: {(ing.quantityPerPlan * manualForm.totalPlans).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeIngredientRow(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPlan}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{submittingPlan ? 'Creating...' : `Create Plan (${manualForm.totalPlans} Units)`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: USE / RELEASE PLANS (PARTIAL RELEASE) */}
      {isUseModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                  <SendHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Use & Release Plans</h3>
                  <p className="text-xs text-slate-500">{activePlan.planNumber} &bull; {activePlan.planName}</p>
                </div>
              </div>
              <button onClick={() => setIsUseModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUseSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Available in Plan</span>
                  <p className="text-lg font-black text-emerald-700">{activePlan.availablePlans ?? activePlan.quantity} units</p>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Already Released</span>
                  <p className="text-lg font-black text-blue-700">{activePlan.releasedPlans || 0} units</p>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">
                  Number of Plans to Release into Production Order:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max={activePlan.availablePlans ?? activePlan.quantity ?? 1}
                    value={plansToUseQty}
                    onChange={e => setPlansToUseQty(Number(e.target.value))}
                    className="flex-1 accent-emerald-600 cursor-pointer"
                  />
                  <input
                    type="number"
                    min="1"
                    max={activePlan.availablePlans ?? activePlan.quantity ?? 1}
                    value={plansToUseQty}
                    onChange={e => setPlansToUseQty(Number(e.target.value))}
                    className="w-20 p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-center text-sm"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Batch Preview */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-extrabold text-indigo-950">Target Production Batch:</span>
                  <span className="font-mono font-black text-indigo-700">{plansToUseQty} pcs</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-600">
                  <span>Remaining Available Pool:</span>
                  <span className="font-mono font-bold">{(activePlan.availablePlans ?? activePlan.quantity) - plansToUseQty} units</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUseModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUse || plansToUseQty <= 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <SendHorizontal className="h-4 w-4" />
                  <span>{submittingUse ? 'Releasing...' : `Release ${plansToUseQty} Units`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: SCHEDULING MODAL */}
      {isScheduleModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Schedule Production Plan</h3>
                  <p className="text-xs text-slate-500">{activePlan.planNumber} &bull; {activePlan.planName}</p>
                </div>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Production Date</label>
                  <input
                    type="date"
                    value={scheduleForm.productionDate}
                    onChange={e => setScheduleForm({ ...scheduleForm, productionDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Shift</label>
                  <select
                    value={scheduleForm.shiftId}
                    onChange={e => setScheduleForm({ ...scheduleForm, shiftId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Morning Shift">Morning Shift (08:00 - 16:00)</option>
                    <option value="Evening Shift">Evening Shift (16:00 - 00:00)</option>
                    <option value="Night Shift">Night Shift (00:00 - 08:00)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Production Line</label>
                  <select
                    value={scheduleForm.lineId}
                    onChange={e => setScheduleForm({ ...scheduleForm, lineId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Main Assembly Line 1">Main Assembly Line 1</option>
                    <option value="High-Speed Line 2">High-Speed Line 2</option>
                    <option value="Robotic Cell 3">Robotic Cell 3</option>
                  </select>
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Machine / Station</label>
                  <select
                    value={scheduleForm.machineId}
                    onChange={e => setScheduleForm({ ...scheduleForm, machineId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Machine Alpha">Machine Alpha</option>
                    <option value="Press Station B">Press Station B</option>
                    <option value="CNC Miller 01">CNC Miller 01</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSchedule}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{submittingSchedule ? 'Scheduling...' : 'Confirm Schedule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: MATERIAL AVAILABILITY CHECK MODAL */}
      {isMatCheckModalOpen && matCheckResult && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Material Availability Check</h3>
                  <p className="text-xs text-slate-500">
                    Plan: <span className="font-bold text-slate-800">{activePlan.planNumber}</span> ({activePlan.quantity || activePlan.totalPlans} units of {activePlan.productId?.name || activePlan.productName})
                  </p>
                </div>
              </div>
              <button onClick={() => setIsMatCheckModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scope & Status Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div>
                <span className="font-extrabold text-slate-700 block">Operating Scope Evaluated:</span>
                <span className="text-[11px] font-semibold text-slate-600">
                  {activePlan.siteId?.name || activeSite?.name || 'All Facilities'} &bull; {activePlan.warehouseId?.name || 'Primary Plant Storage'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500 text-[11px]">Material Status:</span>
                <span className={`px-3 py-1 rounded-md font-extrabold uppercase text-[11px] ${materialBadgeStyles[matCheckResult.status]}`}>
                  {matCheckResult.status}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3">Component / Material</th>
                    <th className="p-3 text-right">Required</th>
                    <th className="p-3 text-right">Available Stock</th>
                    <th className="p-3 text-right">Shortage</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(matCheckResult.components || []).map((comp, idx) => (
                    <tr key={idx} className={comp.shortageQty > 0 ? 'bg-rose-50/40' : 'hover:bg-slate-50/50'}>
                      <td className="p-3">
                        <p className="font-extrabold text-slate-900">{comp.materialName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{comp.materialCode}</p>
                        {comp.locations && comp.locations.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {comp.locations.map((loc, lIdx) => (
                              <span key={lIdx} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-mono">
                                📍 {loc.warehouseName}: <strong className="text-slate-800">{loc.available}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">{comp.requiredQty} {comp.unit}</td>
                      <td className="p-3 text-right font-mono text-slate-600">{comp.availableQty} {comp.unit}</td>
                      <td className={`p-3 text-right font-mono font-extrabold ${comp.shortageQty > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {comp.shortageQty || 0} {comp.unit}
                      </td>
                      <td className="p-3 text-center">
                        {comp.shortageQty > 0 ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-extrabold">SHORTAGE</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-extrabold">READY</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={matChecking}
                  onClick={() => handleMaterialCheck(activePlan, false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-all disabled:opacity-50"
                  title="Check availability across all warehouses in this plant/facility"
                >
                  {matChecking ? 'Checking...' : 'Re-Check (Plant-Wide)'}
                </button>
                <button
                  type="button"
                  disabled={matChecking}
                  onClick={() => handleMaterialCheck(activePlan, true)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-lg text-xs transition-all disabled:opacity-50"
                  title="Check availability strictly within the plan's assigned warehouse only"
                >
                  {matChecking ? 'Checking...' : 'Strict Warehouse Check'}
                </button>
              </div>

              <button
                onClick={() => setIsMatCheckModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: PLAN DETAILS & MULTI-INGREDIENT BREAKDOWN */}
      {isDetailModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">{activePlan.planNumber} &bull; {activePlan.planName}</h3>
                <p className="text-xs text-slate-500">{activePlan.productName || activePlan.productId?.name}</p>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Plan Counts Summary Card */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Total Plans</span>
                <p className="text-lg font-black text-slate-900">{activePlan.totalPlans || activePlan.quantity}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <span className="text-emerald-700 font-bold uppercase text-[10px]">Available</span>
                <p className="text-lg font-black text-emerald-700">{activePlan.availablePlans ?? activePlan.quantity}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center">
                <span className="text-blue-700 font-bold uppercase text-[10px]">Released</span>
                <p className="text-lg font-black text-blue-700">{activePlan.releasedPlans || 0}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-center">
                <span className="text-purple-700 font-bold uppercase text-[10px]">Completed</span>
                <p className="text-lg font-black text-purple-700">{activePlan.completedPlans || 0}</p>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider">Plan Ingredients Breakdown</h4>
                <span className="text-[10px] text-slate-500 font-mono">{(activePlan.ingredients || []).length} items defined</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-48">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Material</th>
                      <th className="p-2.5 text-right">Per Plan</th>
                      <th className="p-2.5 text-right">Total Batch Req.</th>
                      <th className="p-2.5 text-center">Loss %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(activePlan.ingredients || []).map((ing, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-medium text-slate-800">
                          {ing.materialName || ing.material?.name || 'Raw Material'}
                          <span className="block text-[10px] text-slate-400 font-mono">{ing.materialCode || ing.material?.code}</span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">{ing.quantityPerPlan} {ing.uom}</td>
                        <td className="p-2.5 text-right font-mono font-black text-indigo-700">{ing.totalQuantity} {ing.uom}</td>
                        <td className="p-2.5 text-center text-slate-500 font-mono">{ing.lossPercentage || 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit History Timeline */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider">Audit Trail</h4>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {(activePlan.auditHistory || []).map((audit, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-0.5">
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                      <span>{audit.action}</span>
                      <span>{new Date(audit.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-800 font-medium">{audit.details}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
